var harness = require('@bmatusiak/rectify/harness.js');

//RUNNING THE TESTS INSIDE THE APP.
//
//None of the four contexts is easy to boot from a test file, and two are
//impossible: `main` needs nw around it, `window` needs a document. So do not
//boot any of them. Ask the running app -- which is already in all four -- to
//run its own suites and say what happened.
//
//WHY THE HARNESS IS A SERVICE. The module exports one shared instance, and in
//development `main` and `server` are the same node process: they share a module
//registry, so both contexts collected into one set of suites and each reported
//the other's results as its own. `harness.create()` gives an independent one,
//and handing it out as a service is what makes a test plugin say which context
//it belongs to -- by consuming the one in its own graph.
//
//the test plugins are only loaded when asked for. src/main.js takes
//`--selftest`, src/server.js reads it off the host, and src/window.js takes
//`?selftest` on the url. A packaged build has no path that loads them at all.

plugin.consumes = ['app', 'ipc', 'io'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var { ipc, io } = imports;
    var mine = harness.create();

    //whichever page is connected. In development this is socket.io's own map;
    //in a packaged build it is the bridge wearing the same shape.
    function page() {
        var found = null;
        io.sockets.sockets.forEach(function (socket) { if (!found) found = socket; });
        return found;
    }

    function absent(context, why) {
        return { context: context, suites: [], passed: 0, failed: 0, missing: why };
    }

    function fromWindow(timeout) {
        var socket = page();
        if (!socket) return Promise.resolve(absent('window', 'no window is connected'));

        return new Promise(function (resolve) {
            var timer = setTimeout(function () {
                resolve(absent('window', 'the window did not answer within ' + timeout + 'ms'));
            }, timeout);

            socket.emit('selftest:run', {}, function (results) {
                clearTimeout(timer);
                resolve(Object.assign({ context: 'window' }, results || {}));
            });
        });
    }

    //the node half registers its own command as it loads, and this calls it
    //rather than opening a socket to ourselves to ask ourselves a question
    function fromServer() {
        if (ipc.commands().indexOf('selftest:server') < 0) {
            return Promise.resolve(absent('server', 'the node half did not load its tests'));
        }
        return ipc.invoke('selftest:server', {});
    }

    var answered = ipc.handle('selftest', async function (data) {
        var here = Object.assign({ context: 'main' }, await mine.run({ log: function () {} }));

        var server = await fromServer();
        var window_ = await fromWindow((data && data.timeout) || 30000);

        var all = [here, server, window_];

        return {
            contexts: all,
            passed: all.reduce(function (n, c) { return n + c.passed; }, 0),
            failed: all.reduce(function (n, c) { return n + c.failed; }, 0)
        };
    });

    await register(null, {
        selftest: mine,
        onDestroy: function () { answered.remove(); }
    });
}
module.exports = plugin;
