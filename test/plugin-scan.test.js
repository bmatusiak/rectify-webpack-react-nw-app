const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//four places decide what a plugin is: src/main.js and src/cli.js walk the
//folder off disk, and src/server.js, src/window.js and src/main.prod.js hand a
//regex to require.context. Their own comments say they have to agree -- a
//plugin one takes and another misses runs in one build and not the other, and
//neither says a word about it.
//
//so this holds all of them to one answer. The regexes are read out of the
//source rather than copied here, or this file would be a fifth thing to keep in
//step.

const SRC = path.join(__dirname, '..', 'src');
const ROOTS = require('../src/roots');
const PLUGINS = path.join(SRC, ROOTS[0]);
const DEPTH = 2;

function scanned(name) {
    return name[0] != '_' && name[0] != '.' && name != 'vendor';
}

//the walk src/main.js and src/cli.js do
function walked(dir, left, context, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        const here = path.join(dir, entry.name);
        if (fs.existsSync(path.join(here, context + '.js'))) out.push(path.join(here, context + '.js'));
        if (left > 1) walked(here, left - 1, context, out);
    });
    return out;
}

function asKeys(files) {
    return files.map((f) => './' + path.relative(PLUGINS, f).split(path.sep).join('/')).sort();
}

//every path require.context would offer, which is every file under src/app
function everything(dir, out = [], base) {
    base = base || PLUGINS;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const here = path.join(dir, entry.name);
        if (entry.isDirectory()) return everything(here, out, base);
        out.push('./' + path.relative(base, here).split(path.sep).join('/'));
    });
    return out;
}

//EVERY CONTEXT IN THE FILE, KEYED BY THE ROOT IT SCANS. webpack cannot take a
//list, so a second plugin tree is a second require.context with the same regex
//written again -- and "written again" is exactly the thing that drifts, which
//is why they are read back and compared rather than trusted.
function regexesIn(file) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const found = {};

    for (const root of ROOTS) {
        //built rather than written as a literal, because the root name is the
        //variable part -- and every backslash here is doubled on purpose: this
        //is a string that becomes a regex, so `\\.` is what a literal `\.` costs
        const pattern = new RegExp(
            "require\\.context\\('\\./" + root + "',\\s*true,\\s*(/.*/)\\)", 'g');
        let hit;
        while ((hit = pattern.exec(src))) {
            //a file has two: the plugins and, in development, their tests
            (found[root] = found[root] || []).push(eval(hit[1])); // eslint-disable-line no-eval
        }
    }

    return found;
}

//the one that finds the plugins, which is the first in each file
function regexIn(file, root) {
    const all = regexesIn(file);
    assert.ok(all[root || ROOTS[0]], `no require.context for ./${root || ROOTS[0]} in src/${file}`);
    return all[root || ROOTS[0]][0];
}

const offered = everything(PLUGINS);

test('the folder walk and require.context pick the same plugins', () => {
    [
        ['main', 'main.prod.js'],
        ['server', 'server.js'],
        ['window', 'window.js'],
    ].forEach(([context, file]) => {
        const byWalk = asKeys(walked(PLUGINS, DEPTH, context));
        const byRegex = offered.filter((key) => regexIn(file).test(key)).sort();

        assert.deepStrictEqual(byRegex, byWalk,
            `src/${file} and the folder walk disagree about ${context} plugins`);
        assert.ok(byWalk.length > 0, `no ${context} plugins found at all`);
    });
});

//A SECOND TREE IS A SECOND FOLDER AND NOTHING ELSE -- that is the claim
//src/app_plugins exists to make, and this is what holds it up. Each webpack
//file must scan every root, with the SAME regex: one that quietly drifted would
//mean a plugin loads in development and vanishes from the package, which is the
//failure this whole file was written for.
test('every require.context scans every root, with the same rule', () => {
    ['main.prod.js', 'server.js', 'window.js'].forEach((file) => {
        const found = regexesIn(file);

        ROOTS.forEach((root) => {
            assert.ok(found[root], `src/${file} never scans ./${root}`);
        });

        //compare each root's Nth context against the first root's Nth
        ROOTS.slice(1).forEach((root) => {
            assert.equal(found[root].length, found[ROOTS[0]].length,
                `src/${file} scans ./${root} a different number of times`);

            found[root].forEach((rx, at) => {
                assert.equal(String(rx), String(found[ROOTS[0]][at]),
                    `src/${file} uses a different rule for ./${root}`);
            });
        });
    });
});

//and the disk walkers take the same folders from the second tree as the regex
test('the second tree is walked exactly like the first', () => {
    ROOTS.slice(1).forEach((root) => {
        const dir = path.join(SRC, root);
        if (!fs.existsSync(dir)) return;

        const byWalk = walked(dir, DEPTH, 'server')
            .map((f) => './' + path.relative(dir, f).split(path.sep).join('/')).sort();

        const offeredThere = everything(dir, [], dir);
        const byRegex = offeredThere.filter((key) => regexIn('server.js', root).test(key)).sort();

        assert.deepStrictEqual(byRegex, byWalk, `the walk and the regex disagree about ./${root}`);
        assert.ok(byWalk.length > 0, `nothing at all in ./${root}, so this proves nothing`);
    });
});

test('plugins are found one level down and two', () => {
    const depth = (key) => key.replace('./', '').split('/').length;
    const keys = asKeys(walked(PLUGINS, DEPTH, 'window'));

    assert.ok(keys.some((k) => depth(k) === 3), 'a grouped plugin, e.g. ./core/io/window.js');
    assert.ok(keys.some((k) => depth(k) === 2), 'an ungrouped one, e.g. ./demo/window.js');
    assert.ok(keys.every((k) => depth(k) <= 3), 'and nothing deeper: ' + keys.join(' '));
});

test('a folder starting with _ is left alone', () => {
    const parked = path.join(PLUGINS, '_parked');
    fs.mkdirSync(parked, { recursive: true });
    fs.writeFileSync(path.join(parked, 'window.js'), '//not a plugin, parked\n');

    try {
        const keys = asKeys(walked(PLUGINS, DEPTH, 'window'));
        assert.ok(!keys.some((k) => k.includes('_parked')), 'the walk skipped it');
        assert.ok(!regexIn('window.js').test('./_parked/window.js'), 'and so did the regex');
    } finally {
        fs.rmSync(parked, { recursive: true, force: true });
    }
});


//the same walk src/main.js and src/cli.js do, asked for one exact filename
function walkedFor(name, dir = PLUGINS, left = DEPTH, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        const here = path.join(dir, entry.name);
        if (fs.existsSync(path.join(here, name))) out.push(path.join(here, name));
        if (left > 1) walkedFor(name, here, left - 1, out);
    });
    return out;
}

test('a test plugin is not mistaken for a plugin', () => {
    //`<context>.test.js` must not look like a plugin to any of the five
    //discovery sites. The app DOES load them, but only when it is started with
    //--selftest and only in a development build -- never because a walk or a
    //regex could not tell them apart.
    //
    //the walk first, which is what src/main.js and src/cli.js do. It asks for
    //an exact filename, so a test beside a plugin is invisible to it -- but
    //there have to BE tests there for that to prove anything.
    ['cli', 'server', 'main', 'window'].forEach((context) => {
        const plugins = walkedFor(context + '.js');
        const tests = walkedFor(context + '.test.js');

        assert.ok(plugins.length > 0, 'no ' + context + ' plugins found');
        assert.ok(tests.length > 0, 'no ' + context + ' tests found, so this proves nothing');

        plugins.forEach((file) => {
            assert.ok(!file.endsWith('.test.js'), 'the walk picked up a test: ' + file);
        });
    });

    //and then the regex the bundled contexts hand to require.context, read out
    //of the source the same way the rest of this file reads it
    ['server.js', 'window.js', 'main.prod.js'].forEach((entry) => {
        const pattern = regexIn(entry);
        const context = entry === 'main.prod.js' ? 'main' : entry.replace('.js', '');

        assert.ok(pattern.test('./core/io/' + context + '.js'), entry + ' should match a plugin');
        assert.ok(!pattern.test('./core/io/' + context + '.test.js'), entry + ' should NOT match a test');
    });
});

// EVERY PLUGIN CARRIES ITS OWN TESTS, and the audit is here rather than in a
// shell snippet somebody has to remember to run. Adding a context without a
// test beside it is a plugin that is only exercised by whatever happens to use
// it, which in a scaffold is often nothing.
//
// core/selftest is the exception and the only one: it IS the runner, so testing
// it with itself proves nothing that its passing does not already prove. It is
// named here rather than skipped quietly, so a second exception has to be
// argued for in this file.
const RUNNER = path.join('core', 'selftest');

test('every plugin context has a test beside it, except the runner', () => {
    const missing = [];

    // everything() answers in require.context keys -- './core/io/main.js' --
    // so a key has to be turned back into a path before anything on disk can be
    // asked about it
    for (const context of ['main', 'server', 'window', 'cli']) {
        for (const key of everything(PLUGINS)) {
            if (path.basename(key) !== context + '.js') continue;

            const file = path.join(PLUGINS, key.replace('./', ''));
            if (path.dirname(file).indexOf(RUNNER) >= 0) continue;

            const beside = path.join(path.dirname(file), context + '.test.js');
            if (!fs.existsSync(beside)) missing.push(key);
        }
    }

    assert.deepEqual(missing, [], 'these have no test beside them: ' + missing.join(', '));
});
