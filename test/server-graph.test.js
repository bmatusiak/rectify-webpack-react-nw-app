const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');

const express = require('express');
const webpack = require('webpack');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');

//builds the real server entry and runs it against a real express + socket.io,
//which is the half nothing else exercises outside nw. the window half needs a
//dom, so it is covered by the app itself, not from here.

const serverConfig = require('../webpack.config.js')({}, { mode: 'development' })
    .find((c) => c.name == 'server');

let server, ioServer, loaded, url, router;

before(async () => {
    const stats = await new Promise((resolve, reject) => {
        webpack(serverConfig).run((err, s) => (err ? reject(err) : resolve(s)));
    });
    assert.ok(!stats.hasErrors(), stats.toString({ all: false, errors: true }));

    const app = express();
    router = express.Router();
    app.use((req, res, next) => router(req, res, next));

    server = http.createServer(app);
    ioServer = new Server(server);

    const bundle = path.join(serverConfig.output.path, serverConfig.output.filename);
    delete require.cache[require.resolve(bundle)];

    //the app only ever runs under nw, so the host always carries all of this.
    //standing in for it here is what lets the node half be exercised without one.
    const handle = () => ({ remove() {} });

    loaded = await require(bundle)({
        express,
        router,
        httpServer: server,
        io: ioServer,
        appPackage: { title: 'Test App', name: 'test-app', version: '9.9.9' },
        window: {
            url: 'http://127.0.0.1:0/',
            isOpen: false,
            open() {}, show() {}, hide() {}, openInBrowser() {}, quit() {}
        },
        tray: { add: handle, labels: () => [] },
        ipc: { address: 'test', handle, commands: () => [] }
    });

    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = 'http://127.0.0.1:' + server.address().port;
}, { timeout: 120000 });

after(() => {
    try { ioServer.close(); } catch (e) { /* already gone */ }
    try { server.close(); } catch (e) { /* already gone */ }
});

test('the plugin graph resolves on the server side', () => {
    const services = loaded.app.services;
    for (const name of ['app', 'io', 'appPackage', 'window', 'tray', 'ipc'])
        assert.ok(name in services, 'missing service: ' + name);
});

test('the window half is not in this bundle at all', () => {
    const services = loaded.app.services;
    //react, theme and storage are window.js files, so they are not here to stub
    for (const name of ['react', 'theme', 'session', 'config'])
        assert.ok(!(name in services), name + ' leaked into the server bundle');
});

test('the nw services wrap what the host handed over', () => {
    const services = loaded.app.services;
    assert.equal(typeof services.window.show, 'function');
    assert.equal(typeof services.tray.add, 'function');
    assert.equal(typeof services.ipc.handle, 'function');
});

test('a plugin server half mounts its routes on the swappable router', async () => {
    const res = await fetch(url + '/api/hello');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.hello, 'Test App');
});

test('socket.io answers the handshake and the ping', async () => {
    const socket = connect(url, { transports: ['websocket'] });
    try {
        const appPackage = await new Promise((resolve, reject) => {
            socket.once('app', resolve);
            socket.once('connect_error', reject);
        });
        assert.equal(appPackage.title, 'Test App');
        assert.equal(appPackage.version, '9.9.9');

        const reply = await new Promise((resolve) => socket.emit('ping', {}, resolve));
        assert.equal(reply.pong, true);
    } finally {
        socket.close();
    }
});

test('destroy() unhooks the server half so a reload cannot double register', async () => {
    await loaded.destroy();

    const socket = connect(url, { transports: ['websocket'] });
    try {
        const sawApp = await Promise.race([
            new Promise((resolve) => socket.once('app', () => resolve(true))),
            new Promise((resolve) => setTimeout(() => resolve(false), 1500))
        ]);
        assert.equal(sawApp, false, 'handlers survived destroy(), a reload would stack them');
    } finally {
        socket.close();
    }
});
