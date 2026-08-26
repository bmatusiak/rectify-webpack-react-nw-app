const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//THE TEMPLATE HAS TO STILL BE TRUE.
//
//`src/app/example/` is where somebody starts a plugin: copy the folder, rename
//it, delete what you do not need.
//
//IT USED TO BE `_example`, PARKED, and that was the mistake this file was
//written to paper over. Every discovery site skips a folder starting with `_`,
//so a parked template is invisible to the boots, to the readme audit and to the
//per-plugin test rule -- the one thing in this repo that could rot with nothing
//going red. This file checked the one kind of rot it could see from outside: a
//service that had been renamed.
//
//IT COULD NOT SEE THE OTHER TWO. The template had no test beside it and no
//README table, so taking the underscore off -- the thing it exists to invite --
//turned `plugin-scan` and the readme audit red before anybody had written a
//line. And its `server.js` read a `state` document at setup, which the stand-in
//host in ./server-graph.test.js could not answer, because that host had drifted
//six services behind what `core/build` really hands over. Un-parking the folder
//took nine assertions down with it. Both had been true for a whole session.
//
//SO IT IS LIVE NOW, and the app itself is the check: an unresolvable service
//stops the boot, a missing test fails `plugin-scan`, a wrong table fails the
//readme audit, and its own two suites run in the real app.
//
//WHAT IS LEFT FOR THIS FILE IS THE PART THAT NEEDS NO APP. Reading the source
//as text answers in a millisecond and names the file and the service, rather
//than failing somewhere inside a boot -- and it is the only way to ask about
//window.js at all, which is JSX that node cannot parse.

const SRC = path.join(__dirname, '..', 'src');
const EXAMPLE = path.join(SRC, 'app', 'example');
const ROOTS = require('../src/roots');

const CONTEXTS = ['main', 'server', 'window', 'cli'];

function listed(source, what) {
    const hit = new RegExp('plugin\\.' + what + '\\s*=\\s*\\[([^\\]]*)\\]').exec(source);
    if (!hit) return null;

    return hit[1].split(',')
        .map((one) => one.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}

//every service any plugin in any tree provides, in any context
function everythingProvided() {
    const found = new Set(['app', 'Plugin']);//the container's own two

    ROOTS.forEach((root) => {
        const tree = path.join(SRC, root);
        if (!fs.existsSync(tree)) return;

        walk(tree, 2);
    });

    function walk(dir, left) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name[0] === '_' || entry.name[0] === '.' || entry.name === 'vendor') continue;

            const here = path.join(dir, entry.name);

            for (const context of CONTEXTS) {
                const file = path.join(here, context + '.js');
                if (!fs.existsSync(file)) continue;

                (listed(fs.readFileSync(file, 'utf8'), 'provides') || [])
                    .forEach((one) => found.add(one));
            }

            if (left > 1) walk(here, left - 1);
        }
    }

    return found;
}

const files = fs.existsSync(EXAMPLE)
    ? fs.readdirSync(EXAMPLE).filter((f) => /^(main|server|window|cli)\.js$/.test(f))
    : [];

test('there is a template to start a plugin from', () => {
    assert.ok(fs.existsSync(EXAMPLE), 'src/app/example is gone');
    assert.ok(files.length > 0, 'the template has no context files in it');
    assert.ok(fs.existsSync(path.join(EXAMPLE, 'README.md')), 'the template has no README');
});

//THE CHECK THAT EARNS THIS FILE. A template asking for a service that was
//renamed is a template that fails on the first `npm start` after somebody
//copies it -- and they will read that as the scaffold being broken, not as the
//template being stale.
test('every service the template asks for still exists', () => {
    const known = everythingProvided();
    const missing = [];

    files.forEach((name) => {
        const source = fs.readFileSync(path.join(EXAMPLE, name), 'utf8');

        (listed(source, 'consumes') || []).forEach((wanted) => {
            if (!known.has(wanted)) missing.push('example/' + name + ' wants ' + wanted);
        });
    });

    assert.deepEqual(missing, [],
        'the template names services this app no longer has:\n  ' + missing.join('\n  '));
});

test('the template is shaped like a plugin', () => {
    files.forEach((name) => {
        const source = fs.readFileSync(path.join(EXAMPLE, name), 'utf8');

        assert.ok(listed(source, 'consumes'), name + ' has no plugin.consumes');
        assert.ok(listed(source, 'provides'), name + ' has no plugin.provides');
        assert.ok(/module\.exports\s*=\s*plugin/.test(source), name + ' does not export the plugin');
        assert.ok(/register\(/.test(source), name + ' never calls register()');
    });
});

//AND IT MUST LOAD, which is the opposite of what this test used to say.
//
//PARKING IT AGAIN IS THE REGRESSION NOW. An underscore would take it back out of
//every discovery site, and with it the readme audit, the per-plugin test rule
//and its own two suites -- every check that noticed anything wrong with it. The
//folder would look exactly the same and nothing would be watching it, which is
//the state it was in when a stale stand-in host went unnoticed for a session.
test('the template is live, and the bundles really pick it up', () => {
    assert.notEqual(path.basename(EXAMPLE)[0], '_',
        'the template is parked again, and nothing checks a parked template');

    //the same regex the bundles hand to require.context, read out of the source
    //rather than restated -- test/plugin-scan.test.js does this the long way
    const window = fs.readFileSync(path.join(SRC, 'window.js'), 'utf8');
    const hit = /require\.context\('([^']*)',\s*true,\s*(\/.*\/)\)/.exec(window);

    assert.ok(hit, 'no require.context in src/window.js');

    const pattern = eval(hit[2]); // eslint-disable-line no-eval

    assert.ok(pattern.test('./app/example/window.js'),
        'the bundles would not load the template');

    //and an underscore is still what parks a folder, which is the mechanism
    //this one stopped using rather than one that stopped existing
    assert.ok(!pattern.test('./app/_example/window.js'),
        'a parked folder is no longer skipped, so parking anything is broken');
});
