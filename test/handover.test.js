const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//CORE NAMES CORE, AND NOTHING ELSE.
//
//`src/app/core/build/main.js` builds the object the node half is handed, and it
//names every service it carries in its `consumes`. That is right for core-to-core
//-- hiding those behind a lookup would make the host harder to read for nothing.
//
//IT IS WRONG THE MOMENT AN APP SERVICE APPEARS IN IT. Then core knows that an
//app plugin exists, and that plugin is no longer liftable: take it to another
//project and it arrives with a strand attached to a `core/build` that project
//does not have. `src/app_plugins` exists to prove a feature can be removed
//without touching the app, and a feature that needs a line in core to work is
//not removable -- it is only undeployed.
//
//`core/handover` is the container that makes the rule keepable. This is what
//makes it CHECKABLE, which is the difference between a rule and an intention.

const SRC = path.join(__dirname, '..', 'src');
const ROOTS = require('../src/roots');

function consumesIn(file) {
    const source = fs.readFileSync(file, 'utf8');
    const hit = /plugin\.consumes\s*=\s*\[([^\]]*)\]/.exec(source);
    if (!hit) return [];

    return hit[1].split(',')
        .map((one) => one.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}

//every service name provided by a plugin under core/, in any context
function coreProvides() {
    const found = new Set(['app', 'Plugin']);//the container's own two
    const core = path.join(SRC, 'app', 'core');

    for (const name of fs.readdirSync(core)) {
        const dir = path.join(core, name);
        if (!fs.statSync(dir).isDirectory()) continue;

        for (const file of fs.readdirSync(dir)) {
            if (!/^(main|server|window|cli)\.js$/.test(file)) continue;

            const source = fs.readFileSync(path.join(dir, file), 'utf8');
            const hit = /plugin\.provides\s*=\s*\[([^\]]*)\]/.exec(source);
            if (!hit) continue;

            hit[1].split(',')
                .map((one) => one.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean)
                .forEach((one) => found.add(one));
        }
    }

    return found;
}

test('nothing in core consumes a service from outside core', () => {
    const known = coreProvides();
    const core = path.join(SRC, 'app', 'core');
    const strays = [];

    for (const name of fs.readdirSync(core)) {
        const dir = path.join(core, name);
        if (!fs.statSync(dir).isDirectory()) continue;

        for (const file of fs.readdirSync(dir)) {
            if (!/^(main|server|window|cli)\.js$/.test(file)) continue;

            consumesIn(path.join(dir, file)).forEach((wanted) => {
                if (!known.has(wanted)) strays.push('core/' + name + '/' + file + ' wants ' + wanted);
            });
        }
    }

    assert.deepEqual(strays, [],
        'core is naming a service it does not own, so whatever provides it can no longer be lifted out:\n  ' +
        strays.join('\n  ') + '\n  hand it over through core/handover instead');
});

//AND THE CONTAINER IS ACTUALLY CARRIED. The rule above is only keepable if there
//is somewhere else to put things -- a green run with no `of` on the host would
//mean core had simply stopped carrying anything.
test('the host carries the handover container', () => {
    const source = fs.readFileSync(path.join(SRC, 'app', 'core', 'build', 'main.js'), 'utf8');

    assert.ok(/of:\s*handover\.get/.test(source),
        'core/build no longer puts handover.get on the host as `of`');
    assert.ok(consumesIn(path.join(SRC, 'app', 'core', 'build', 'main.js')).includes('handover'),
        'core/build does not consume handover');
});

//A PLUGIN OUTSIDE core MAY NAME WHATEVER IT LIKES. The rule is one-directional,
//and saying so here stops somebody "fixing" it into a rule that would forbid
//../app_plugins/tts-page consuming `pages`.
test('the rule is one-directional, and only core is held to it', () => {
    const known = coreProvides();

    assert.ok(known.has('build'), 'core/build stopped providing build');
    assert.ok(known.has('log'), 'core/log stopped providing log');

    //`tts` is an app_plugins service; core must never know the name, and a
    //plugin outside core consuming it is perfectly ordinary
    assert.ok(!known.has('tts'), 'an app service is being provided from core');

    ROOTS.forEach((root) => {
        assert.equal(typeof root, 'string');
    });
});
