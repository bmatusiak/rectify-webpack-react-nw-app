const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');

const express = require('express');
const webpack = require('webpack');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');

const rectify = require('@bmatusiak/rectify');
const wanted = require('../src/target.js');
const Config = require('../src/config.js');

//builds the real server entry and runs it against a real express + socket.io,
//which is the half nothing else exercises outside nw. the window half needs a
//dom, so it is covered by the app itself, not from here.

const serverConfig = require('../webpack.config.js')({}, { mode: 'development' })
    .find((c) => c.name == 'server');

let server, ioServer, loaded, url, router, mainish;

//THE APP THIS PRETENDS TO BE. `name` is what ../src/app/core/dataDir/main.js
//derives its directory from, so this run keeps its things under `test-app`
//rather than in the real app's -- isolation by the mechanism being tested,
//rather than by a switch put there for the test.
const APP_PACKAGE = { title: 'Test App', name: 'test-app', version: '9.9.9' };

//---- the half of the host that comes from main ----------------------------
//
//THE REAL PLUGINS, BUILT, NOT STOOD IN FOR -- and the difference is the whole
//reason this exists. ../src/app/core/build/main.js hands the server half
//fourteen things; the object below used to carry eight, and the six missing
//ones were exactly those that live in main: dataDir, log, state, cron, secret
//and what handover is carrying.
//
//NOTHING NOTICED, BECAUSE NOTHING TOUCHED THEM AT SETUP. A server plugin that
//uses `state` inside a socket handler works either way -- the refusal only
//fires when the handler runs, which is never, here. The one that reads a
//document while it is being set up cannot start at all, and takes the graph
//down with it. src/app/example/server.js does exactly that, on line 36, which
//is how this was found: the template broke nine assertions in this file by
//being un-parked and doing the thing it is there to demonstrate.
//
//SO A STAND-IN WOULD HAVE BEEN THE WRONG FIX. A hand-written `state` that
//answers plausibly is a second opinion about where this app keeps things, and
//CLAUDE.md has the scar from the last mock host: its `quit` was a no-op, so a
//test that called quit passed and proved nothing. These are the same files
//main loads, resolved by the same container, against a real directory.
async function mainHalf() {
    //IN DEPENDENCY-FREE ORDER ON PURPOSE? No -- rectify works the order out of
    //`consumes`. This is the reading order: where things live, then what is
    //kept there.
    const plugins = ['dataDir', 'log', 'handover', 'state', 'cron', 'secret'].map((one) => {
        const where = path.join('core', one, 'main.js');
        return wanted.stamp(require(path.join(__dirname, '..', 'src', 'app', where)), where);
    });

    //`Plugin` is rectify's own base class, pushed in by all four boots
    plugins.push(rectify.PluginBase);
    plugins.config = Config();

    const app = rectify.build(plugins, { appPackage: APP_PACKAGE });
    app.on('error', (err) => { throw err; });

    //THE APP AND NOT JUST ITS SERVICES, because ../src/app/core/cron/main.js
    //owns an interval -- one beat for the whole app -- and a live timer keeps
    //node's event loop open. Returning the services alone ran every assertion
    //in this file correctly and then hung for ever with nothing printed, which
    //reads exactly like a test that is stuck rather than one that finished.
    return { app: await app.start(), services: app.services };
}

//whatever the node half answers on the control socket, kept so the tests can
//call it the way the cli would
const handlers = {};

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
    const handle = (name, fn) => { handlers[name] = fn; return { remove() {} }; };

    mainish = await mainHalf();

    loaded = await require(bundle)({
        express,
        router,
        httpServer: server,
        io: ioServer,
        appPackage: APP_PACKAGE,

        //WHAT MAIN OWNS, HANDED OVER THE SAME WAY core/build HANDS IT OVER --
        //see that file's own list, which this has to keep up with. A service
        //here that is missing there is a graph testing something the app does
        //not do; one there that is missing here is the drift that hid for a
        //whole session.
        dataDir: mainish.services.dataDir,
        log: mainish.services.log,
        state: mainish.services.state,
        cron: mainish.services.cron,
        secret: mainish.services.secret,
        of: mainish.services.handover.get,
        handedOver: mainish.services.handover.names,
        window: {
            url: 'http://127.0.0.1:0/',
            isOpen: false,
            open() {}, show() {}, hide() {}, openInBrowser() {}, quit() {},
            capture: async (options) => ({
                format: options.format === 'jpeg' ? 'jpeg' : 'png',
                buffer: Buffer.from([1, 2, 3, 4, 5]),
                width: 800, height: 600
            })
        },
        tray: { add: handle, labels: () => [] },
        ipc: { address: 'test', handle, commands: () => [] }
    });

    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = 'http://127.0.0.1:' + server.address().port;
}, { timeout: 120000 });

after(async () => {
    try { ioServer.close(); } catch (e) { /* already gone */ }
    try { server.close(); } catch (e) { /* already gone */ }

    //AND THE CLOCK, or this file passes and never returns
    try { await mainish.app.destroy(); } catch (e) { /* never started */ }

    //WHAT THIS RUN KEPT, TAKEN BACK. dataDir puts it under the app's `name`,
    //so it is `test-app` and never the real one -- the check below says so out
    //loud rather than trusting that, because this is a recursive delete.
    try {
        const kept = mainish.services.dataDir.path;
        if (path.basename(kept) === APP_PACKAGE.name) fs.rmSync(kept, { recursive: true, force: true });
    } catch (e) { /* nothing was written, or it is in use */ }
});

test('the plugin graph resolves on the server side', () => {
    const services = loaded.app.services;
    for (const name of ['app', 'io', 'appPackage', 'window', 'tray', 'ipc'])
        assert.ok(name in services, 'missing service: ' + name);
});

//AND EVERY ONE OF THEM IS NAMED AFTER WHERE IT LIVES.
//
//src/target.js can be asked whether `stamp` works; only a booted graph can be
//asked whether the boot called it. This is the fast half of that -- the window
//boot has the same check inside the app, in src/app/demo/window.test.js.
//
//It matters beyond the Graph page: `app.plugins` is what rectify names when a
//plugin cannot be resolved, and every setup function in this app is called
//`plugin`, so without the stamping that message names none of them.
test('every plugin is named after the file it came from', () => {
    const records = loaded.app.plugins;
    assert.ok(records.length > 5, 'no plugin records to look at');

    //rectify's own PluginBase is pushed in by the boot and is not a file under
    //src/app, so one that is not a path is expected
    const unnamed = records.filter(p => String(p.name || '').indexOf('/') < 0);

    assert.ok(unnamed.length <= 1,
        unnamed.length + ' of ' + records.length + ' are not named after a file: '
        + unnamed.map(p => p.name).join(' | '));

    const server = records.filter(p => /\/server\.js$/.test(String(p.name || '')));
    assert.ok(server.length > 5, 'only ' + server.length + ' are named after a server.js');
});

test('the window half is not in this bundle at all', () => {
    const services = loaded.app.services;
    //react, theme and webStorage are window.js files, so they are not here to
    //stub. `preferences` and `session` are the browser's two stores -- the node
    //half keeps its own things in `state`, which IS here.
    for (const name of ['react', 'theme', 'session', 'preferences'])
        assert.ok(!(name in services), name + ' leaked into the server bundle');
});

test('the nw services wrap what the host handed over', () => {
    const services = loaded.app.services;
    assert.equal(typeof services.window.show, 'function');
    assert.equal(typeof services.tray.add, 'function');
    assert.equal(typeof services.ipc.handle, 'function');
});

test('a plugin server half mounts its routes on the swappable router', async () => {
    const res = await fetch(url + '/api/status');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.pid, 'number');
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

//---- the remote control --------------------------------------------------

//the window half is the thing that clicks, and it needs a document, so what is
//exercised here is the half in between: which view a command goes to, and what
//comes back. the view is played by a socket.io client that answers.

function view(nw) {
    const socket = connect(url, { transports: ['websocket'] });

    socket.on('remote:click', (data, ack) => {
        if (data.selector === 'nothing') return ack({ error: 'nothing matches "nothing"' });
        ack({ found: 'selector', clicked: { element: 'button', text: data.selector } });
    });

    return new Promise((resolve, reject) => {
        socket.once('connect_error', reject);
        socket.once('app', () => {
            socket.emit('remote:hello', { app: nw, title: nw ? 'the window' : 'a browser' });
            //the hello has to land before the server is asked to choose
            setTimeout(() => resolve(socket), 150);
        });
    });
}

test('with nothing connected, a click says so rather than hanging', async () => {
    await assert.rejects(() => handlers.click({ selector: 'a' }), /no view is connected/);
});

test('a click reaches the view and comes back described', async () => {
    const socket = await view(true);
    try {
        const out = await handlers.click({ selector: 'Save' });
        assert.equal(out.clicked.text, 'Save');
        assert.equal(out.view, 'window');
        assert.equal(out.views, undefined);//only one, so not worth saying
    } finally {
        socket.close();
    }
});

test('the window wins over a browser view, and the answer says which', async () => {
    const browser = await view(false);
    const window = await view(true);
    try {
        const out = await handlers.click({ selector: 'Save' });
        assert.equal(out.view, 'window');
        assert.equal(out.views, 2);//and says there was a choice to make
    } finally {
        browser.close(); window.close();
    }
});

test('an error from the view arrives as an error, not as a result', async () => {
    const socket = await view(true);
    try {
        await assert.rejects(() => handlers.click({ selector: 'nothing' }), /nothing matches/);
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

test('capture puts the picture where the caller asked and reports it', async () => {
    const file = path.join(os.tmpdir(), 'capture-' + process.pid + '.png');

    const out = await handlers.capture({ path: file });

    assert.equal(out.path, file);
    assert.equal(out.bytes, 5);
    assert.equal(out.format, 'png');
    assert.equal(out.width, 800);
    assert.deepEqual(Array.from(fs.readFileSync(file)), [1, 2, 3, 4, 5]);

    fs.unlinkSync(file);
});

test('a relative path lands beside the app rather than nowhere', async () => {
    const out = await handlers.capture({ path: 'relative-shot.png' });

    assert.ok(path.isAbsolute(out.path));
    assert.equal(path.basename(out.path), 'relative-shot.png');

    fs.unlinkSync(out.path);
});

test('the buffer never goes onto the wire, only what it became', async () => {
    const out = await handlers.capture({ path: path.join(os.tmpdir(), 'wire-' + process.pid + '.png') });

    //the protocol is one json line, so anything on it has to survive this
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(out))).sort(),
        ['bytes', 'format', 'height', 'path', 'width']);

    fs.unlinkSync(out.path);
});
