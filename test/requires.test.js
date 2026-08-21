const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

//a plugin that reaches outside its own folder counts the levels between it and
//what it wants. Move the folder and every one of those counts is wrong, and
//nothing says so until the line runs -- which for a main-side require means
//when the app boots, not when the tests pass.
//
//that is not hypothetical. Regrouping the plugins under src/app/core put four
//of them a level deeper and left four requires counting the old depth. npm test
//was green: it builds the server half with webpack, and these are read off disk
//at runtime by nw. The app did not start at all.
//
//so: resolve every relative require in the tree, and say which one is wrong.

const ROOT = path.join(__dirname, '..');

//tools/ is in here on purpose. tools/nw.js reaches into src/app/core/ipc for
//the control socket address rather than writing it out a second time, which is
//the right trade and also a path that a plugin move would break.
const LOOKED_AT = ['src', 'tools'];

//by folder name rather than by a path pattern, which would need a separator
//class and therefore backslashes, and those do not survive every editor between
//here and this file intact.
//
//`dist` and `build` are NOT in here, and that is the point. Only src and tools
//are walked and neither holds build output -- but src/app/core/build is a
//plugin, and skipping folders by that name skipped the very file whose broken
//require started all of this. The test passed with the bug back in.
const SKIP = ['node_modules', 'vendor', 'swatch'];

//what a resolved path is allowed to be, since not everything is a bare .js
const ENDINGS = ['', '.js', '.json', '.jsx', '.scss', '.css', path.sep + 'index.js'];

function sources(dir, found = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIP.includes(entry.name)) continue;

        const here = path.join(dir, entry.name);
        if (entry.isDirectory()) sources(here, found);
        else if (entry.name.endsWith('.js')) found.push(here);
    }
    return found;
}

//require('../x'), require("../../x") -- only the ones that climb, since a
//sibling require breaks loudly the moment anything touches the folder
function climbing(text) {
    const out = [];
    const pattern = /require\(\s*['"](\.\.[^'"]*)['"]\s*\)/g;

    let match;
    while ((match = pattern.exec(text))) out.push(match[1]);
    return out;
}

//built artefacts are a real dependency and a legitimate absence: dist/ is gone
//on a clean checkout and rebuilt by npm run build. Judge the path, not the file.
function buildOutput(spec) {
    return spec.includes('/dist/');
}

test('every relative require resolves to something that exists', () => {
    const broken = [];
    let checked = 0;

    for (const dir of LOOKED_AT) {
        for (const file of sources(path.join(ROOT, dir))) {
            const text = fs.readFileSync(file, 'utf8');

            for (const spec of climbing(text)) {
                checked++;
                if (buildOutput(spec)) continue;

                const target = path.resolve(path.dirname(file), spec);
                const exists = ENDINGS.some((end) => fs.existsSync(target + end));

                if (!exists) broken.push(path.relative(ROOT, file) + '  ->  ' + spec);
            }
        }
    }

    assert.ok(checked > 0, 'found nothing to check, which means the walk is wrong');
    assert.deepEqual(broken, [], 'these climb to somewhere that is not there:\n  ' + broken.join('\n  '));
});

test('a require into dist is counted, not quietly skipped', () => {
    //the exemption above is narrow on purpose. If it ever stops matching, the
    //requires it was covering start being checked against a folder that may not
    //exist, and this test says so rather than the app failing when packaged.
    const specs = [];

    for (const file of sources(path.join(ROOT, 'src'))) {
        for (const spec of climbing(fs.readFileSync(file, 'utf8'))) {
            if (buildOutput(spec)) specs.push(spec);
        }
    }

    assert.ok(specs.length > 0, 'nothing requires a build artefact any more -- drop the exemption');
    specs.forEach((spec) => {
        assert.ok(spec.endsWith('.json'), 'only assets.json was meant to be exempt, got ' + spec);
    });
});
