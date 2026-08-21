//the bridge is what a packaged build uses instead of socket.io: main injects a
//way home into the page before any of the page's own script runs, and answers
//by postMessage. In development it is built and left inert, because there is a
//real server to talk to.
//
//the wire protocol underneath it is plain logic and is tested in
//test/bridge.test.js. What is only true in a running app is which of the two
//this build is actually using, and that the unused one is not quietly attached.

plugin.consumes = ['selftest', 'app', 'bridge', 'io'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, bridge, io } = imports;

    describe('the bridge, in the running app', function () {

        it('wears socket.io shape whether or not it is the one in use', function () {
            //that is the whole trick: no plugin downstream knows which build it
            //is in, because both answer to the same handful of methods
            ['on', 'off', 'emit', 'removeAllListeners', 'disconnectSockets', 'close'].forEach(function (name) {
                assert.equal(typeof bridge.io[name], 'function', 'bridge.io has no ' + name);
            });
            assert.ok(bridge.io.sockets && bridge.io.sockets.sockets, 'no socket map');
        });

        it('opens the page out of the package, and names it', function () {
            //no url, so a file beside the app -- with nothing executable in it
            assert.equal(bridge.page, 'view.html');
        });

        it('is the transport when packaged, and idle when not', function () {
            if (app.isPackaged) {
                assert.equal(io, bridge.io, 'a packaged build is not using the bridge');
                assert.equal(bridge.connected, true, 'the window is not on it');
            } else {
                assert.notEqual(io, bridge.io, 'development is using the bridge instead of socket.io');
                assert.equal(bridge.connected, false, 'the bridge attached to something it should not have');
            }
        });
    });

    register();
}
module.exports = plugin;
