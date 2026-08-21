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
const PLUGINS = path.join(SRC, 'app');
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
function everything(dir, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const here = path.join(dir, entry.name);
        if (entry.isDirectory()) return everything(here, out);
        out.push('./' + path.relative(PLUGINS, here).split(path.sep).join('/'));
    });
    return out;
}

function regexIn(file) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const match = src.match(/require\.context\('\.\/app',\s*true,\s*(\/.*\/)\)/);
    assert.ok(match, `no require.context regex found in src/${file}`);
    return eval(match[1]);   // eslint-disable-line no-eval -- the source's own literal
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
