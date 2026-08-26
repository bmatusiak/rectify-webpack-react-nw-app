const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//THE TEMPLATE HAS TO STILL BE TRUE.
//
//`src/app/_example/` is where somebody starts a plugin: copy the folder, take
//the underscore off, delete what you do not need. The underscore is also why
//nothing else checks it -- every discovery site skips a folder starting with
//one, so it is invisible to the boots, to the readme audit and to the
//per-plugin test rule.
//
//WHICH MAKES IT THE ONE THING IN THIS REPO THAT CAN ROT WITHOUT ANYTHING GOING
//RED, and a rotten template is worse than none: somebody starts from it, gets a
//service that no longer exists, and concludes the scaffold is broken. `settings`
//became `preferences` and `storage` became `webStorage` in one afternoon -- a
//template written the day before would have been wrong by teatime.
//
//IT IS CHECKED AS TEXT rather than by requiring it. window.js is JSX, which node
//cannot parse, and the interesting question is not whether it runs -- it is
//whether every name it reaches for is still a name this app has.

const SRC = path.join(__dirname, '..', 'src');
const EXAMPLE = path.join(SRC, 'app', '_example');
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
    assert.ok(fs.existsSync(EXAMPLE), 'src/app/_example is gone');
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
            if (!known.has(wanted)) missing.push('_example/' + name + ' wants ' + wanted);
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

//AND IT MUST NOT LOAD. The underscore is the whole of "this is a template", so
//if the folder is ever renamed without being finished, every boot picks it up.
test('the template is parked, and every discovery site skips it', () => {
    assert.equal(path.basename(EXAMPLE)[0], '_', 'the template folder lost its underscore');

    //the same regex the bundles hand to require.context, read out of the source
    //rather than restated -- test/plugin-scan.test.js does this the long way
    const window = fs.readFileSync(path.join(SRC, 'window.js'), 'utf8');
    const hit = /require\.context\('([^']*)',\s*true,\s*(\/.*\/)\)/.exec(window);

    assert.ok(hit, 'no require.context in src/window.js');

    const pattern = eval(hit[2]); // eslint-disable-line no-eval
    assert.ok(!pattern.test('./app/_example/window.js'), 'the bundles would load the template');
});
