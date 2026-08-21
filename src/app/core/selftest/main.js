var harness = require('@bmatusiak/rectify/harness.js');

//RUNNING THE TESTS INSIDE THE APP.
//
//Two of the four contexts cannot be booted from a test file. `main` needs nw
//around it -- there is no nw.Window, no tray, no app to be single instance of.
//`window` needs a document, a compositor and a stylesheet that has loaded.
//
//So do not boot them. Ask the running app, which is already in both, to run its
//own suites and say what happened. That is what this is: one ipc command that
//runs the main-context harness here, asks the window for its own over the
//socket, and hands back the pair of them.
//
//the test plugins are only loaded when asked for -- see src/main.js and
//src/window.js, which take `--selftest` and `?selftest` respectively. A normal
//run does not have them, and a packaged build cannot: BUILD_PROD drops the
//whole require.context.

plugin.consumes = ['app', 'ipc', 'io'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var { app, ipc, io } = imports;

    //whichever page is connected. In development this is socket.io's own map;
    //in a packaged build it is the bridge wearing the same shape.
    function page() {
        var found = null;
        io.sockets.sockets.forEach(function (socket) { if (!found) found = socket; });
        return found;
    }

    function fromWindow(timeout) {
        var socket = page();
        if (!socket) return Promise.resolve({
            context: 'window', suites: [], passed: 0, failed: 0,
            missing: 'no window is connected'
        });

        return new Promise(function (resolve) {
            var timer = setTimeout(function () {
                resolve({
                    context: 'window', suites: [], passed: 0, failed: 0,
                    missing: 'the window did not answer within ' + timeout + 'ms'
                });
            }, timeout);

            socket.emit('selftest:run', {}, function (results) {
                clearTimeout(timer);
                resolve(Object.assign({ context: 'window' }, results || {}));
            });
        });
    }

    var answered = ipc.handle('selftest', async function (data) {
        //the main context's own suites, registered by whatever main.test.js
        //files were loaded
        var here = await harness.run({ log: function () {} });

        var there = await fromWindow((data && data.timeout) || 30000);

        return {
            contexts: [Object.assign({ context: 'main' }, here), there],
            passed: here.passed + there.passed,
            failed: here.failed + there.failed
        };
    });

    await register(null, {
        selftest: {
            //so the tray or a page could offer it too, not only the terminal
            run: function (timeout) { return ipc.commands() && fromWindow(timeout || 30000); }
        },
        onDestroy: function () { answered.remove(); }
    });
}
module.exports = plugin;
