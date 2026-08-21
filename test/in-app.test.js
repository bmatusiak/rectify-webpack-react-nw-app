const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const rectify = require('@bmatusiak/rectify');
const harness = require('@bmatusiak/rectify/harness.js');

//THE TESTS ARE ANOTHER BOOT.
//
//This is src/cli.js with the `<context>.test.js` files added to the plugin
//list. They are plugins like any other: they declare what they consume, so the
//container hands each one the real service and loads it after whatever made it.
//As they load they register their suites, and once the app is up this runs the
//lot and reports each one as a subtest here.
//
//Which is the point of doing it this way. There is nothing to mock and no
//second wiring to keep in step -- a test that consumes `cli` is handed the same
//`cli` the app is handed, assembled by the same resolver, in the same order.
//
//WHY THE CLI CONTEXT AND NOT THE OTHERS. It is the one that runs in plain node.
//`main` needs nw around it, `window` needs a document, and `server` is bundled
//by webpack -- test/server-graph.test.js boots that one the long way instead.
//The pattern is the same for all four; what differs is what has to exist first.

const ROOT = path.join(__dirname, '..');
const PLUGINS = path.join(ROOT, 'src', 'app');
//the same walk src/cli.js and src/main.js do, two levels deep, skipping the
//same folders
function gather(dir, depth, name, found = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name[0] === '_' || entry.name[0] === '.' || entry.name === 'vendor') continue;

        const here = path.join(dir, entry.name);
        const file = path.join(here, name);

        if (fs.existsSync(file)) found.push(file);
        if (depth > 1) gather(here, depth - 1, name, found);
    }
    return found;
}

//a context, its plugins and its tests, built and run. What differs between the
//two is only what has to be handed in as the host.
async function boot(context, host) {
    const plugins = gather(PLUGINS, 2, context + '.js').map(require);
    const tests = gather(PLUGINS, 2, context + '.test.js').map(require);

    assert.ok(plugins.length > 0, 'no ' + context + ' plugins found -- the walk is wrong');
    assert.ok(tests.length > 0, 'no ' + context + ' test plugins found -- the walk is wrong');

    const all = plugins.concat(tests);
    all.push(rectify.PluginBase);
    all.config = require(path.join(ROOT, 'src', 'config.js'))();

    return { app: await rectify.build(all, host).start(), plugins, tests };
}

//each suite the plugins registered as they loaded, reported one by one so a
//failure names itself rather than arriving as a count
async function report(t, results) {
    for (const suite of results.suites) {
        for (const one of suite.tests) {
            await t.test(suite.name + ' -- ' + one.name, () => {
                if (!one.ok) throw new Error(one.error);
            });
        }
    }

    assert.ok(results.passed > 0, 'the harness ran nothing');
    assert.equal(results.failed, 0, results.failed + ' failed inside the app');
}

test('the cli app, tested from inside itself', async (t) => {
    const pkg = require(path.join(ROOT, 'package.json'));

    const { app } = await boot('cli', {
        isCli: true,
        root: ROOT,
        argv: [],
        appPackage: {
            title: pkg.title || pkg.name,
            name: pkg.name,
            version: pkg.version
        }
    });

    await report(t, await harness.run({ log: function () { /* reported above */ } }));
    await app.destroy();
});

test('a test plugin is not mistaken for a plugin', () => {
    //`<context>.test.js` must not look like a plugin to any of the five
    //discovery sites, or the app would load its own tests at runtime. Checked
    //rather than assumed, because the day it stops being true the app ships
    //its test suite.
    //
    //the walk first, which is what src/cli.js and src/main.js do. It asks for
    //an exact filename, so a test beside a plugin is invisible to it -- but
    //there have to BE tests there for that to mean anything.
    ['cli', 'server'].forEach((context) => {
        const walked = gather(PLUGINS, 2, context + '.js');
        const tests = gather(PLUGINS, 2, context + '.test.js');

        assert.ok(walked.length > 0, 'no ' + context + ' plugins found');
        assert.ok(tests.length > 0, 'no ' + context + ' tests found, so this proves nothing');

        walked.forEach((file) => {
            assert.ok(!file.endsWith('.test.js'), 'the walk picked up a test: ' + file);
        });
    });

    //and then the regex the bundled contexts hand to require.context, read out
    //of the source the same way plugin-scan.test.js reads it
    ['server.js', 'window.js', 'main.prod.js'].forEach((entry) => {
        const source = fs.readFileSync(path.join(ROOT, 'src', entry), 'utf8');
        const found = source.match(/require\.context\('\.\/app',\s*true,\s*(\/.*\/)\)/);
        assert.ok(found, 'no require.context regex in src/' + entry);

        const pattern = eval(found[1]);  // eslint-disable-line no-eval -- the source's own literal
        const context = entry === 'main.prod.js' ? 'main' : entry.replace('.js', '');

        assert.ok(pattern.test('./core/io/' + context + '.js'), entry + ' should match a plugin');
        assert.ok(!pattern.test('./core/io/' + context + '.test.js'), entry + ' should NOT match a test');
    });
});

//A HOST THE SERVER HALF CAN BE BOOTED AGAINST.
//
//In the app this is built by core/build/main.js out of things only nw has: a
//real window, a real tray icon, a real control socket. None of that is here and
//none of it needs to be -- what the server half is written against is the
//SHAPE. Every one of these keeps a ledger, so the boot can ask afterwards what
//was left behind.
//
//that ledger is the point of the whole exercise. This half is torn down and
//rebuilt on every save, and the contract each wrapper keeps is "whatever I
//registered, I hand back". No plugin can check that about itself: it is gone by
//the time the question can be asked.
function mockHost() {
    const ipcHandlers = new Map();
    const trayItems = [];
    const ioListeners = new Map();
    const routes = [];

    function listen(map) {
        return {
            on: (event, fn) => {
                if (!map.has(event)) map.set(event, []);
                map.get(event).push(fn);
            },
            off: (event, fn) => {
                const list = map.get(event) || [];
                const i = list.indexOf(fn);
                if (i >= 0) list.splice(i, 1);
            },
            removeAllListeners: (event) => { event ? map.delete(event) : map.clear(); }
        };
    }

    const io = Object.assign(listen(ioListeners), {
        emit: () => {},
        disconnectSockets: () => {},
        close: () => {},
        sockets: { sockets: new Map() },
        engine: { clientsCount: 0 }
    });

    const router = {};
    ['get', 'post', 'put', 'delete', 'use', 'all'].forEach((verb) => {
        router[verb] = (route) => { routes.push(verb + ' ' + route); return router; };
    });

    return {
        isPackaged: false,
        appPackage: { title: 'Test App', name: 'test-app', version: '9.9.9' },
        io,
        router,

        ipc: {
            address: 'test-control-socket',
            handle: (name, fn) => {
                ipcHandlers.set(name, fn);
                return { remove: () => ipcHandlers.delete(name) };
            },
            commands: () => [...ipcHandlers.keys()].sort(),

            //not part of the real host. The window and the cli reach these over
            //a socket, and a test in the same process has no socket to reach
            //them with -- this is that reach.
            invoke: (name, data) => {
                const fn = ipcHandlers.get(name);
                if (!fn) throw new Error('no handler for ' + name);
                return fn(data || {});
            }
        },

        tray: {
            add: (options) => {
                const entry = { options };
                trayItems.push(entry);
                return {
                    remove: () => {
                        const i = trayItems.indexOf(entry);
                        if (i >= 0) trayItems.splice(i, 1);
                    }
                };
            },
            labels: () => trayItems.map((e) => e.options.label)
        },

        window: {
            url: 'http://127.0.0.1:0/',
            isOpen: false,
            open() {}, show() {}, hide() {}, openInBrowser() {}, quit() {},
            capture: async () => ({ format: 'png', buffer: Buffer.from([1, 2, 3]), width: 8, height: 4 })
        },

        //what the boot asks about once everything has been torn down
        ledger: {
            get ipc() { return [...ipcHandlers.keys()].sort(); },
            get tray() { return trayItems.map((e) => e.options.label); },
            get io() { return [...ioListeners.keys()].filter((k) => (ioListeners.get(k) || []).length); }
        }
    };
}

test('the server half, tested from inside itself', async (t) => {
    const host = mockHost();
    const { app } = await boot('server', { isServer: true, host });

    await report(t, await harness.run({ log: function () { /* reported above */ } }));

    //WHAT NO SINGLE PLUGIN CAN CHECK ABOUT ITSELF.
    //
    //This half is thrown away and rebuilt on every save. Everything it put on
    //the socket, the tray and the socket server has to come off with it, or the
    //previous build is still answering -- which looks like the app working
    //until two of them answer at once. It has happened here.
    //
    //There are two things keeping that true and this checks the pair of them.
    //Each plugin gives back what it took, and core/ipc/server.js keeps a
    //handle on everything it handed out and gives back the lot. Breaking
    //either one alone leaves the ledger clean -- which is the point of having
    //both -- so this only fails when they have both been lost. Measured: with
    //one gone it passes, with both gone it names the handlers left behind.
    assert.ok(host.ledger.ipc.length > 0, 'nothing registered, so this proves nothing');
    assert.ok(host.ledger.tray.length > 0, 'no tray items, so this proves nothing');

    await app.destroy();

    assert.deepEqual(host.ledger.ipc, [], 'ipc handlers left behind after destroy');
    assert.deepEqual(host.ledger.tray, [], 'tray items left behind after destroy');
    assert.deepEqual(host.ledger.io, [], 'socket listeners left behind after destroy');
});

test('a second load leaves no more behind than the first', async (t) => {
    //the reload, done twice, which is what a save does. If teardown were
    //partial the ledger would grow, and this is the shape that catches it.
    const host = mockHost();

    const first = await boot('server', { isServer: true, host });
    const afterFirst = host.ledger.ipc.length;
    await first.app.destroy();

    const second = await boot('server', { isServer: true, host });
    assert.equal(host.ledger.ipc.length, afterFirst, 'the second load registered a different amount');

    await second.app.destroy();
    assert.deepEqual(host.ledger.ipc, [], 'left behind after the second teardown');
});
