const { test } = require('node:test');
const assert = require('node:assert');

const wanted = require('../src/target.js');

//WHO A PLUGIN IS, AND WHICH SUITES A TARGETED RUN TAKES.
//
//Both answers live in src/target.js because five places need them and five
//copies would drift. The targeting half is exercised every time `npm test --
//core/ipc` is typed; the naming half is not exercised by anything unless it is
//checked here, because a plugin with the wrong name still resolves, still runs,
//and only reads wrong.

test('stamp gives a plugin the name of where it lives', () => {
    function plugin() { }
    assert.equal(plugin.name, 'plugin');

    wanted.stamp(plugin, 'core/io/window.js');
    assert.equal(plugin.name, 'core/io/window.js');
});

test('stamp normalises what the five boots hand it', () => {
    //require.context keys arrive as './core/io/window.js', a disk walk on
    //windows as 'core\\io\\window.js', and the graph has to draw one of them
    const fromContext = wanted.stamp(function plugin() { }, './core/io/window.js');
    const fromWalk = wanted.stamp(function plugin() { }, 'core\\io\\window.js');

    assert.equal(fromContext.name, 'core/io/window.js');
    assert.equal(fromWalk.name, 'core/io/window.js');
});

test('stamp is the name itself, so stamping twice is not two wrappers', () => {
    let calls = 0;
    function plugin() { calls++; }
    plugin.consumes = ['io'];
    plugin.provides = ['thing'];

    const once = wanted.stamp(plugin, 'a/b/main.js');
    const twice = wanted.stamp(once, 'a/b/main.js');

    assert.equal(once, plugin, 'stamping replaced the plugin with something else');
    assert.equal(twice, plugin);
    assert.equal(twice.name, 'a/b/main.js');

    //and what rectify reads off it is untouched
    assert.deepEqual(twice.consumes, ['io']);
    assert.deepEqual(twice.provides, ['thing']);

    twice();
    assert.equal(calls, 1, 'the plugin was wrapped rather than named');
});

test('stamp leaves anything that is not a plugin alone', () => {
    const notAFunction = { consumes: [] };
    assert.equal(wanted.stamp(notAFunction, 'a/b/main.js'), notAFunction);
});

//A TEST PLUGIN IS WRAPPED, because it has something to do at call time -- it
//says its own name to the harness before it registers anything. That wrapper
//must still carry the name, or every test plugin in the app is called `wrapped`.
test('tag wraps, and the wrapper is still named after the plugin', () => {
    let said = null;
    let ran = false;

    function plugin(imports) { ran = true; return imports; }
    plugin.consumes = ['selftest'];
    plugin.provides = [];

    const tagged = wanted.tag(plugin, 'ui/banner/window.test.js');
    assert.equal(tagged.name, 'ui/banner/window.test.js');
    assert.deepEqual(tagged.consumes, ['selftest']);

    tagged({ selftest: { as: name => { said = name; } } });
    assert.equal(ran, true);
    assert.equal(said, 'ui/banner/window.test.js', 'the suite was not attributed to its plugin');
});
