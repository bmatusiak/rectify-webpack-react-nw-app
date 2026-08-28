const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const configs = require('../webpack.config.js')({}, { mode: 'development' });
const windowBundle = configs.find((c) => c.name == 'window');
const server = configs.find((c) => c.name == 'server');

//the externals rule shipped broken once: it matched anything starting with a
//letter, which on windows includes the entry's own absolute path (C:\...), so
//webpack emitted a stub that re-required the entry and node choked on the jsx.

function externalize(request) {
    return new Promise((resolve) => {
        server.externals[0]({ request }, (err, result) => resolve(result));
    });
}

test('bare specifiers stay external on the server', async () => {
    assert.equal(await externalize('express'), 'commonjs express');
    assert.equal(await externalize('@bmatusiak/rectify'), 'commonjs @bmatusiak/rectify');
});

test('relative and absolute requests are bundled, not externalized', async () => {
    assert.equal(await externalize('./app/storage'), undefined);
    assert.equal(await externalize('../overlay'), undefined);
    assert.equal(await externalize(path.join(__dirname, '..', 'src', 'server.js')), undefined);
    assert.equal(await externalize('/srv/app/src/server.js'), undefined);
});

test('both bundles resolve the same extensions', () => {
    for (const c of [windowBundle, server]) {
        assert.ok(c.resolve.extensions.includes('.js'), c.name + ' cannot resolve .js');
        assert.ok(!c.resolve.extensions.includes('.ts'), c.name + ' still expects typescript');
    }
});

//the packaged main is the one bundle that must carry everything, since the
//package has no node_modules beside it
const main = require('../webpack.config.js')({}, { mode: 'production', bundle: 'main' })[0];

test('the packaged main bundles everything, externalising nothing', () => {
    assert.equal(main.name, 'main');
    assert.equal(main.target, 'node');
    assert.equal(main.externals, undefined, 'an external would be missing at runtime');
});

test('the packaged main is told it is packaged', () => {
    const defines = main.plugins
        .filter((p) => p.definitions)
        .map((p) => p.definitions.BUILD_PROD)
        .filter((v) => v !== undefined);
    assert.deepEqual(defines, ['true'], 'BUILD_PROD gates webpack itself out of the package');
});

// THE HARDENING SWITCH, WHICH IS A CONSTANT RATHER THAN A SETTING.
//
// A binary built with "canServe": false must not CONTAIN the routes or the
// socket.io server -- a runtime flag can be flipped by whoever runs the app,
// and the point of this one is that there is nothing left to flip. That only
// holds while it reaches the bundle as a define, so this checks it does.
test('the packaged main is told whether it may ever serve', () => {
    const defines = main.plugins
        .filter((p) => p.definitions)
        .map((p) => p.definitions.BUILD_SERVABLE)
        .filter((v) => v !== undefined);

    assert.equal(defines.length, 1, 'BUILD_SERVABLE never reaches the packaged bundle');
    assert.ok(defines[0] === 'true' || defines[0] === 'false', 'it is ' + defines[0]);
});

// ABSENT FROM THE MANIFEST MEANS YES. Anything else would make every app that
// has never heard of this key silently unable to serve.
test('a manifest that says nothing about serving may still serve', () => {
    const manifest = require('../package.json');
    const said = manifest.app && manifest.app.canServe;

    if (said === false) {
        assert.equal(defineFor('BUILD_SERVABLE'), 'false', 'the manifest says no and the build says yes');
    } else {
        assert.equal(defineFor('BUILD_SERVABLE'), 'true',
            'the manifest does not say no, so the build must allow it');
    }
});

function defineFor (name) {
    return main.plugins
        .filter((p) => p.definitions)
        .map((p) => p.definitions[name])
        .filter((v) => v !== undefined)[0];
}

test('the window bundle is named after its entry, not main.js', () => {
    //otherwise it overwrites the packaged main, which also writes into dist
    assert.equal(windowBundle.output.filename, 'window.js');
    assert.notEqual(windowBundle.output.filename, main.output.filename);
});

test('the window is a web bundle and the server is a node one', () => {
    assert.equal(windowBundle.target, 'web');
    assert.equal(server.target, 'node');
    assert.equal(server.output.library.type, 'commonjs2');
});

// AND THE STANCE, WHICH IS THE ONE CONSTANT THAT DIFFERS BETWEEN THE CONFIGS OF
// A SINGLE RUN.
//
// A closed build must not CONTAIN the branch that lets something drive it, which
// only holds while the answer reaches the bundle as a define rather than being
// read at runtime -- the same argument as BUILD_SERVABLE above, applied to the
// surface a model actually arrives on.
test('the packaged main is told whether it may be driven', () => {
    const said = defineFor('BUILD_OPEN');

    assert.notEqual(said, undefined, 'BUILD_OPEN never reaches the packaged bundle');
    assert.ok(said === 'true' || said === 'false', 'it is ' + said);
});

// ABSENT FROM THE MANIFEST MEANS CLOSED WHEN PACKAGED AND OPEN IN DEVELOPMENT,
// which is the only default safe in the direction that matters. Getting this
// backwards ships a driveable binary and nothing says a word.
test('a manifest that says nothing ships a closed package and an open dev build', () => {
    const manifest = require('../package.json');
    const said = manifest.app && manifest.app.open;

    if (typeof said === 'boolean') {
        assert.equal(defineFor('BUILD_OPEN'), String(said), 'the manifest is not being read');
        return;
    }

    assert.equal(defineFor('BUILD_OPEN'), 'false',
        'the manifest does not say, so a PACKAGE must be closed');

    for (const c of [windowBundle, server]) {
        const dev = c.plugins
            .filter((p) => p.definitions)
            .map((p) => p.definitions.BUILD_OPEN)
            .filter((v) => v !== undefined)[0];

        assert.equal(dev, 'true', c.name + ' cannot be driven in development');
    }
});

// ONE RULE, READ TWICE. src/main.js is loaded off disk by nw and never goes
// through webpack, so it works the answer out for itself -- and if it worked it
// out DIFFERENTLY, a development build and its own window would disagree about
// whether they are open, which has no symptom until something is quietly
// reachable.
test('the build and the boot nw reads off disk agree about the stance', () => {
    const stance = require('../src/stance');
    const manifest = require('../package.json');

    assert.equal(String(stance.decided(false, manifest)), defineForIn(windowBundle, 'BUILD_OPEN'));
    assert.equal(String(stance.decided(true, manifest)), defineFor('BUILD_OPEN'));
});

function defineForIn (config, name) {
    return config.plugins
        .filter((p) => p.definitions)
        .map((p) => p.definitions[name])
        .filter((v) => v !== undefined)[0];
}
