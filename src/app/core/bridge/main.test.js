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

        //IT CARRIES THE WINDOW IN EVERY BUILD NOW.
        //
        //This used to assert that development did NOT use the bridge, which was
        //true and was the problem: the transport every packaged app depends on
        //was the one no day of development ever ran. The window is on it either
        //way, and what changes with the build is only whether socket.io is also
        //there for a browser to join.
        it('carries the window, in every build', function () {
            assert.equal(bridge.connected, true, 'the window is not on the bridge');
            assert.ok(bridge.io.sockets.sockets.size > 0, 'no socket on the bridge');
        });

        //AND `io` IS NEITHER TRANSPORT -- it is the fan-out over both, so that
        //serve.js registers its handlers once rather than once per transport.
        it('is one of the transports behind io, not io itself', function () {
            assert.notEqual(io, bridge.io, 'io is the bare bridge, so a browser could never join');
            assert.ok(io.transports >= 1, 'io is not a fan-out');
            assert.ok(io.engine.clientsCount >= 1, 'the fan-out cannot see the window');
        });
    });

    register();
}
module.exports = plugin;
