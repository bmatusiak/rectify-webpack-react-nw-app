const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const rectify = require('@bmatusiak/rectify');
const harness = require('@bmatusiak/rectify/harness.js');

//THE TESTS ARE ANOTHER BOOT.
//
//This is src/cli.js with the `<context>.test.js` files added to the plugin
//list. They are plugins like any other: they declare what they consume, so the
//container hands each one the real service and loads it after whatever made it.
//As they load they register their suites, and once the app is up this runs the
//lot and reports each one as a subtest here.
//
//Which is the point of doing it this way. There is nothing to mock and no
//second wiring to keep in step -- a test that consumes `cli` is handed the same
//`cli` the app is handed, assembled by the same resolver, in the same order.
//
//WHY THE CLI CONTEXT AND NOT THE OTHERS. It is the one that runs in plain node.
//`main` needs nw around it, `window` needs a document, and `server` is bundled
//by webpack -- test/server-graph.test.js boots that one the long way instead.
//The pattern is the same for all four; what differs is what has to exist first.

const ROOT = path.join(__dirname, '..');
const PLUGINS = path.join(ROOT, 'src', 'app');
const CONTEXT = 'cli';

//the same walk src/cli.js does, two levels deep, skipping the same folders
function gather(dir, depth, suffix, found = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name[0] === '_' || entry.name[0] === '.' || entry.name === 'vendor') continue;

        const here = path.join(dir, entry.name);
        const file = path.join(here, CONTEXT + suffix);

        if (fs.existsSync(file)) found.push(file);
        if (depth > 1) gather(here, depth - 1, suffix, found);
    }
    return found;
}

test('the cli app, tested from inside itself', async (t) => {
    const plugins = gather(PLUGINS, 2, '.js').map(require);
    const tests = gather(PLUGINS, 2, '.test.js').map(require);

    assert.ok(plugins.length > 0, 'no cli plugins found -- the walk is wrong');
    assert.ok(tests.length > 0, 'no cli test plugins found -- the walk is wrong');

    const all = plugins.concat(tests);
    all.push(rectify.PluginBase);
    all.config = require(path.join(ROOT, 'src', 'config.js'))();

    const pkg = require(path.join(ROOT, 'package.json'));

    const app = await rectify.build(all, {
        isCli: true,
        root: ROOT,
        argv: [],
        appPackage: {
            title: pkg.title || pkg.name,
            name: pkg.name,
            version: pkg.version
        }
    }).start();

    //every suite the plugins registered as they loaded
    const results = await harness.run({ log: function () { /* reported below */ } });

    for (const suite of results.suites) {
        for (const one of suite.tests) {
            await t.test(suite.name + ' -- ' + one.name, () => {
                if (!one.ok) throw new Error(one.error);
            });
        }
    }

    assert.ok(results.passed > 0, 'the harness ran nothing');
    assert.equal(results.failed, 0, results.failed + ' failed inside the app');

    await app.destroy();
});

test('a test plugin is not mistaken for a plugin', () => {
    //`<context>.test.js` must not look like a plugin to any of the five
    //discovery sites, or the app would load its own tests at runtime. Checked
    //rather than assumed, because the day it stops being true the app ships
    //its test suite.
    //
    //the walk first, which is what src/cli.js and src/main.js do:
    const walked = gather(PLUGINS, 2, '.js');

    assert.ok(walked.length > 0, 'the walk found nothing');
    walked.forEach((file) => {
        assert.ok(!file.endsWith('.test.js'), 'the walk picked up a test: ' + file);
    });

    //and then the regex the bundled contexts hand to require.context, read out
    //of the source the same way plugin-scan.test.js reads it
    ['server.js', 'window.js', 'main.prod.js'].forEach((entry) => {
        const source = fs.readFileSync(path.join(ROOT, 'src', entry), 'utf8');
        const found = source.match(/require\.context\('\.\/app',\s*true,\s*(\/.*\/)\)/);
        assert.ok(found, 'no require.context regex in src/' + entry);

        const pattern = eval(found[1]);  // eslint-disable-line no-eval -- the source's own literal
        const context = entry === 'main.prod.js' ? 'main' : entry.replace('.js', '');

        assert.ok(pattern.test('./core/io/' + context + '.js'), entry + ' should match a plugin');
        assert.ok(!pattern.test('./core/io/' + context + '.test.js'), entry + ' should NOT match a test');
    });
});
