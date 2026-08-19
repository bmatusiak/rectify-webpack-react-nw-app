const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const configs = require('../webpack.config.js')({}, { mode: 'development' });
const client = configs.find((c) => c.name == 'client');
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
    assert.equal(await externalize('./core/storage'), undefined);
    assert.equal(await externalize('../overlay'), undefined);
    assert.equal(await externalize(path.join(__dirname, '..', 'src', 'server.js')), undefined);
    assert.equal(await externalize('/srv/app/src/server.js'), undefined);
});

test('both bundles resolve .ts the same way', () => {
    for (const c of [client, server]) {
        assert.ok(c.resolve.extensions.includes('.ts'), c.name + ' cannot resolve .ts');
        assert.ok(c.resolve.extensions.includes('.js'), c.name + ' cannot resolve .js');
    }
});

test('the client is a web bundle and the server is a node one', () => {
    assert.equal(client.target, 'web');
    assert.equal(server.target, 'node');
    assert.equal(server.output.library.type, 'commonjs2');
});
