const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//five places decide what a plugin is: src/main.js and src/cli.js walk the
//folders off disk, and src/server.js, src/window.js and src/main.prod.js hand a
//regex to require.context. Their own comments say they have to agree -- a
//plugin one takes and another misses runs in one build and not the other, and
//neither says a word about it.
//
//so this holds all of them to one answer. The regexes are read out of the
//source rather than copied here, or this file would be a sixth thing to keep in
//step.

const SRC = path.join(__dirname, '..', 'src');
const ROOTS = require('../src/roots');
const gather = require('../src/gather');
const DEPTH = 2;

function scanned(name) {
    return name[0] != '_' && name[0] != '.' && name != 'vendor';
}

//the walk src/main.js and src/cli.js do, inside one tree
function walked(dir, left, context, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        const here = path.join(dir, entry.name);
        if (fs.existsSync(path.join(here, context + '.js'))) out.push(path.join(here, context + '.js'));
        if (left > 1) walked(here, left - 1, context, out);
    });
    return out;
}

//A KEY IS ROOTED AT src/, NOT AT A TREE -- './app/core/io/server.js'. That is
//what require.context answers now that there is one context over src/ rather
//than one per tree, and src/gather.js is what turns it back into the plugin's
//own name.
const key = (file) => './' + path.relative(SRC, file).split(path.sep).join('/');

//every tree's walk, in one list
function walkedAll(context) {
    return ROOTS.filter((root) => fs.existsSync(path.join(SRC, root)))
        .flatMap((root) => walked(path.join(SRC, root), DEPTH, context))
        .map(key).sort();
}

//every path require.context would offer, which is every file under src/
function everything(dir = SRC, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const here = path.join(dir, entry.name);
        if (entry.isDirectory()) return everything(here, out);
        out.push(key(here));
    });
    return out;
}

//THE CONTEXTS IN A FILE, IN ORDER: the plugins first, and in development their
//tests second. Read back rather than restated, because a regex written in two
//places is a regex that drifts in one of them.
function regexesIn(file) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const pattern = /require\.context\('([^']*)',\s*true,\s*(\/.*\/)\)/g;
    const found = [];

    let hit;
    while ((hit = pattern.exec(src))) found.push({ dir: hit[1], regex: eval(hit[2]) }); // eslint-disable-line no-eval

    assert.ok(found.length, `no require.context at all in src/${file}`);
    return found;
}

//the one that finds the plugins, which is the first in each file
function regexIn(file) {
    return regexesIn(file)[0].regex;
}

const BUNDLED = [
    ['main', 'main.prod.js'],
    ['server', 'server.js'],
    ['window', 'window.js'],
];

const offered = everything();

test('the folder walk and require.context pick the same plugins', () => {
    BUNDLED.forEach(([context, file]) => {
        const byWalk = walkedAll(context);
        const pattern = regexIn(file);

        //the regex takes a superset -- any folder under src/ shaped like a
        //plugin -- and the trees decide what survives, exactly as gather.js does
        const byRegex = offered.filter((k) => pattern.test(k))
            .filter((k) => ROOTS.indexOf(k.split('/')[1]) >= 0).sort();

        assert.deepStrictEqual(byRegex, byWalk,
            `src/${file} and the folder walk disagree about ${context} plugins`);
        assert.ok(byWalk.length > 0, `no ${context} plugins found at all`);
    });
});

//NO DISCOVERY SITE NAMES A TREE -- that is the claim package.json's srcDirs
//makes, and this is what holds it up. It used to be one require.context per
//tree with the same regex written out twice in three files, so adding a tree
//was six edits and a missed one was a plugin that loaded in development and
//vanished from the package.
test('every context scans src/ itself, and names no tree', () => {
    BUNDLED.forEach(([, file]) => {
        regexesIn(file).forEach(({ dir }) => {
            assert.equal(dir, './',
                `src/${file} points a require.context at ${dir} -- a tree named in the source`);
        });
    });
});

//and the rule it hands that context has to accept every tree there is, or
//naming one in package.json would be naming one that cannot match
test('one rule, and it accepts every tree', () => {
    BUNDLED.forEach(([context, file]) => {
        const pattern = regexIn(file);

        ROOTS.forEach((root) => {
            assert.ok(pattern.test(`./${root}/core/io/${context}.js`),
                `src/${file} cannot match a grouped plugin in ./${root}`);
            assert.ok(pattern.test(`./${root}/demo/${context}.js`),
                `src/${file} cannot match an ungrouped plugin in ./${root}`);
        });
    });
});

//A TREE THAT IS NOT LISTED IS COMPILED AND NOT REGISTERED, which is the one
//cost of the roots being a filter rather than the scan. Said out loud here so
//it is a decision rather than a surprise: `_` in front of the folder is what
//keeps a tree out of the bundle entirely.
test('gather registers the listed trees and drops the rest', () => {
    const keys = ['./app/demo/server.js', './pr121/core/thing/server.js'];
    const context = (k) => { const p = () => { }; p.came = k; return p; };
    context.keys = () => keys;

    const got = gather(context, ['app']);
    assert.equal(got.length, 1, 'an unlisted tree was registered');
    assert.equal(got[0].came, './app/demo/server.js');

    //AND A PLUGIN IS NAMED AFTER ITS OWN TREE, never after the tree it is in:
    //`core/thing/server.js`, so moving a plugin between trees keeps its name
    //in app.plugins, on the graph, and in `npm test -- core/thing`
    assert.equal(gather(context, ['app', 'pr121'])[1].name, 'core/thing/server.js');
    assert.equal(gather(context, ['app'])[0].name, 'demo/server.js');
});

//and the manifest is held to what the discovery rules can actually find
test('a srcDir the scan could never match is refused', () => {
    const roots = require('../src/roots');

    assert.deepStrictEqual(roots.of(['src/app', 'src/pr121']), ['app', 'pr121']);

    [
        ['../shared/plugins', 'outside src/'],
        ['src/app/core', 'two levels down'],
        ['plugins', 'not under src/ at all'],
        ['src/_parked', 'parked with an underscore'],
    ].forEach(([entry, why]) => {
        assert.throws(() => roots.of([entry]), /srcDirs/, `${entry} (${why}) was accepted`);
    });

    assert.throws(() => roots.of(['src/app', 'src/app']), /twice/, 'a tree listed twice was accepted');
});

test('plugins are found one level down and two', () => {
    const depth = (k) => k.replace('./', '').split('/').length;
    const keys = walkedAll('window');

    //one more than it used to be: a key is rooted at src/ now, so ./app/demo is
    //two and ./app/core/io is three
    assert.ok(keys.some((k) => depth(k) === 4), 'a grouped plugin, e.g. ./app/core/io/window.js');
    assert.ok(keys.some((k) => depth(k) === 3), 'an ungrouped one, e.g. ./app/demo/window.js');
    assert.ok(keys.every((k) => depth(k) <= 4), 'and nothing deeper: ' + keys.join(' '));
});

test('a folder starting with _ is left alone', () => {
    const parked = path.join(SRC, ROOTS[0], '_parked');
    fs.mkdirSync(parked, { recursive: true });
    fs.writeFileSync(path.join(parked, 'window.js'), '//not a plugin, parked\n');

    try {
        const keys = walkedAll('window');
        assert.ok(!keys.some((k) => k.includes('_parked')), 'the walk skipped it');
        assert.ok(!regexIn('window.js').test(`./${ROOTS[0]}/_parked/window.js`), 'and so did the regex');
    } finally {
        fs.rmSync(parked, { recursive: true, force: true });
    }
});

//AND A WHOLE TREE PARKED THE SAME WAY, which is how a tree is kept out of the
//build rather than merely unregistered
test('a tree starting with _ is not a tree', () => {
    const pattern = regexIn('window.js');
    assert.ok(!pattern.test('./_pr121/core/thing/window.js'), 'a parked tree was still scanned');
    assert.ok(pattern.test('./pr121/core/thing/window.js'), 'so this proves nothing');
});

//the same walk src/main.js and src/cli.js do, asked for one exact filename
function walkedFor(name, dir, left = DEPTH, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        const here = path.join(dir, entry.name);
        if (fs.existsSync(path.join(here, name))) out.push(path.join(here, name));
        if (left > 1) walkedFor(name, here, left - 1, out);
    });
    return out;
}

const inEveryTree = (name) => ROOTS.filter((root) => fs.existsSync(path.join(SRC, root)))
    .flatMap((root) => walkedFor(name, path.join(SRC, root)));

test('a test plugin is not mistaken for a plugin', () => {
    //`<context>.test.js` must not look like a plugin to any of the five
    //discovery sites. The app DOES load them, but only in a development build --
    //never because a walk or a regex could not tell them apart.
    //
    //the walk first, which is what src/main.js and src/cli.js do. It asks for
    //an exact filename, so a test beside a plugin is invisible to it -- but
    //there have to BE tests there for that to prove anything.
    ['cli', 'server', 'main', 'window'].forEach((context) => {
        const plugins = inEveryTree(context + '.js');
        const tests = inEveryTree(context + '.test.js');

        assert.ok(plugins.length > 0, 'no ' + context + ' plugins found');
        assert.ok(tests.length > 0, 'no ' + context + ' tests found, so this proves nothing');

        plugins.forEach((file) => {
            assert.ok(!file.endsWith('.test.js'), 'the walk picked up a test: ' + file);
        });
    });

    //and then the regex the bundled contexts hand to require.context, read out
    //of the source the same way the rest of this file reads it
    BUNDLED.forEach(([context, file]) => {
        const pattern = regexIn(file);

        assert.ok(pattern.test(`./${ROOTS[0]}/core/io/${context}.js`), file + ' should match a plugin');
        assert.ok(!pattern.test(`./${ROOTS[0]}/core/io/${context}.test.js`), file + ' should NOT match a test');
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

    //EVERY TREE, not the first one. The audit used to look at src/app alone,
    //which meant a second tree could carry untested plugins indefinitely --
    //and a tree is where a feature being tried out lives, so it is the half
    //that needs the check more, not less.
    for (const context of ['main', 'server', 'window', 'cli']) {
        for (const file of inEveryTree(context + '.js')) {
            if (path.dirname(file).indexOf(RUNNER) >= 0) continue;

            const beside = path.join(path.dirname(file), context + '.test.js');
            if (!fs.existsSync(beside)) missing.push(key(file));
        }
    }

    assert.deepEqual(missing, [], 'these have no test beside them: ' + missing.join(', '));
});
