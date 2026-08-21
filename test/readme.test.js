const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

//every plugin carries a README, and its table says what the source says.
//
//a table of provides/consumes is exactly the kind of documentation that goes
//stale in silence: the plugin keeps working, the reader is told something that
//stopped being true two refactors ago. so it is read back off the source.

const APP = path.join(__dirname, '..', 'src', 'app');
const CONTEXTS = ['main', 'server', 'window', 'cli'];

//the same two levels the boots walk
function plugins() {
    const found = [];
    for (const name of fs.readdirSync(APP)) {
        const dir = path.join(APP, name);
        if (!fs.statSync(dir).isDirectory()) continue;
        if (name.charAt(0) == '_' || name.charAt(0) == '.' || name == 'vendor') continue;

        if (contexts(dir).length) { found.push(dir); continue; }

        for (const inner of fs.readdirSync(dir)) {
            const sub = path.join(dir, inner);
            if (!fs.statSync(sub).isDirectory()) continue;
            if (inner.charAt(0) == '_' || inner.charAt(0) == '.' || inner == 'vendor') continue;
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
    const m = [null, source.slice(source.indexOf('[', at) + 1, close)];
    if (!m) return null;
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
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
    const name = path.relative(APP, dir).split(path.sep).join('/');

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
