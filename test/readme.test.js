const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

//every plugin carries a README, and its table says what the source says.
//
//a table of provides/consumes is exactly the kind of documentation that goes
//stale in silence: the plugin keeps working, the reader is told something that
//stopped being true two refactors ago. so it is read back off the source.

//EVERY TREE, from the one place that names them. src/app_plugins is a second
//root and its plugins carry READMEs under the same rule -- checking only the
//first would leave a whole tree undocumented while this stayed green, which is
//the failure this file exists to prevent.
const ROOTS = require('../src/roots').map((name) => path.join(__dirname, '..', 'src', name));
const CONTEXTS = ['main', 'server', 'window', 'cli'];

//A FOLDER THIS WALK IGNORES MUST NOT BE TOUCHED ON DISK FIRST.
//
//This used to `statSync` every entry and check the name afterwards, which made
//it fail intermittently in a way that read like a bug in this file: node runs
//test FILES concurrently, and plugin-scan.test.js proves the underscore rule by
//creating `src/app/_parked`, asserting, and removing it. This walk could list
//src/app while it existed and stat it after it was gone -- `ENOENT: stat
//.../src/app/_parked`, thrown from a line about READMEs, in a run where nobody
//had edited anything.
//
//`withFileTypes` ANSWERS THE TYPE FROM THE LISTING ITSELF, so there is no second
//syscall to lose the race with -- and the name is checked before anything else,
//so a parked folder is skipped without the disk being asked about it at all.
//requires.test.js carries the same scar and the long version of the story.
function plugins() {
    const found = [];
    for (const root of ROOTS) for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const name = entry.name;
        if (name.charAt(0) == '_' || name.charAt(0) == '.' || name == 'vendor') continue;
        if (!entry.isDirectory()) continue;

        const dir = path.join(root, name);
        if (contexts(dir).length) { found.push(dir); continue; }

        for (const inner of fs.readdirSync(dir, { withFileTypes: true })) {
            if (inner.name.charAt(0) == '_' || inner.name.charAt(0) == '.' || inner.name == 'vendor') continue;
            if (!inner.isDirectory()) continue;

            const sub = path.join(dir, inner.name);
            if (contexts(sub).length) found.push(sub);
        }
    }
    return found;
}

function contexts(dir) {
    return CONTEXTS.filter((c) => fs.existsSync(path.join(dir, c + '.js')));
}

//`plugin.provides = ['a', 'b'];` -> ['a', 'b']
function declared(file, which) {
    const source = fs.readFileSync(file, 'utf8');
    const at = source.indexOf('plugin.' + which + ' = [');
    if (at < 0) return null;
    const close = source.indexOf(']', at);
    const inside = source.slice(source.indexOf('[', at) + 1, close);

    //ONLY THE QUOTED NAMES, because a comment inside the list is legal js and
    //splitting on commas turned one into a service called
    //`//THE PLUGIN PAGE IS WHAT USES THESE` -- which then failed as a mismatch
    //against the README, pointing at the wrong thing entirely.
    return (inside.match(/'[^']*'|"[^"]*"/g) || [])
        .map((one) => one.slice(1, -1).trim())
        .filter(Boolean);
}

//one row: | `main.js` | `a`, `b` | `c` |  ->  ['main.js', ['a','b'], ['c']]
function rows(readme) {
    return fs.readFileSync(readme, 'utf8').split('\n')
        .map((line) => line.match(/^\|\s*`(main|server|window|cli)\.js`\s*\|(.*)\|(.*)\|\s*$/))
        .filter(Boolean)
        .map((m) => ({
            context: m[1],
            provides: names(m[2]),
            consumes: names(m[3])
        }));
}

function names(cell) {
    const found = cell.match(/`[^`]+`/g);
    return found ? found.map((s) => s.slice(1, -1)) : [];
}

const all = plugins();

test('there are plugins to check', () => {
    assert.ok(all.length > 10, 'found only ' + all.length);
});

for (const dir of all) {
    //named from its own root, so a plugin in the second tree is `mcp` -- the
    //same name src/target.js stamps on it and `npm test -- mcp` matches
    const root = ROOTS.filter((one) => dir.indexOf(one) === 0)
        .sort((a, b) => b.length - a.length)[0];
    const name = path.relative(root, dir).split(path.sep).join('/');

    test(name + ' has a README', () => {
        assert.ok(fs.existsSync(path.join(dir, 'README.md')),
            name + ' has no README.md. every plugin carries one.');
    });

    test(name + ' README table matches the source', () => {
        const readme = path.join(dir, 'README.md');
        if (!fs.existsSync(readme)) return;//the test above already said so

        const listed = rows(readme);
        const real = contexts(dir);

        assert.deepEqual(listed.map((r) => r.context).sort(), real.slice().sort(),
            name + ': the README lists ' + listed.map((r) => r.context).join(', ') +
            ' but the folder has ' + real.join(', '));

        for (const row of listed) {
            const file = path.join(dir, row.context + '.js');
            for (const which of ['provides', 'consumes']) {
                const source = declared(file, which);
                if (source === null) continue;//not every context declares both
                assert.deepEqual(row[which].slice().sort(), source.slice().sort(),
                    name + '/' + row.context + ' ' + which + ': README says [' +
                    row[which].join(', ') + '], source says [' + source.join(', ') + ']');
            }
        }
    });
}
