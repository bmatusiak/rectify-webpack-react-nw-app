//socket.io, from the side that created it. In development it lives on the http
//server this app owns; in a packaged build there is no http server and what
//wears the same shape is the bridge. Both are checked by asking what is
//connected, which is the only thing anything downstream actually uses.

plugin.consumes = ['selftest', 'app', 'io', 'http'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, io } = imports;

    describe('io, from the process that made it', function () {

        it('exists and can be asked what is connected', function () {
            assert.ok(io, 'no io service');
            assert.ok(io.sockets && io.sockets.sockets, 'no socket map');
            assert.equal(typeof io.on, 'function');
        });

        //THE WINDOW CONNECTS ON ITS OWN SCHEDULE, WHICH IS NOT THIS ONE.
        //
        //This used to say the window had connected before any of it ran, and
        //that the app having got this far was itself the setup. Not so: a suite
        //asked for immediately after `npm start` can run while the page is still
        //opening its socket, and then this fails with "nothing is connected" on
        //a perfectly healthy app. Waiting for it is the difference between
        //testing the app and testing how fast the machine is.
        it('has the window on it', async function () {
            for (var i = 0; i < 80 && !io.engine.clientsCount; i++) {
                await new Promise(function (resolve) { setTimeout(resolve, 25); });
            }
            assert.ok(io.engine.clientsCount > 0, 'nothing connected within two seconds');
        });

        //THE TWO COUNTERS AGREE ONCE A CONNECTION HAS SETTLED, AND NOT BEFORE.
        //
        //`engine.clientsCount` counts transports; `sockets.sockets` counts the
        //namespace's members. A client that has opened a transport and not yet
        //joined is legitimately in one and not the other, so comparing them at
        //an arbitrary instant is asserting a coincidence -- which is exactly how
        //this behaved: green on its own, red about one full run in three, with
        //`Expected 0 === 1`.
        //
        //What is worth asserting is that they CONVERGE: no socket is left half
        //attached. So it waits for the value to stop moving, and fails if it
        //never does.
        it('counts the same sockets two ways, once they have settled', async function () {
            var mine = 0, theirs = 0;

            for (var i = 0; i < 40; i++) {
                mine = io.sockets.sockets.size;
                theirs = io.engine.clientsCount;
                if (mine === theirs) return;
                await new Promise(function (resolve) { setTimeout(resolve, 25); });
            }

            assert.equal(mine, theirs, 'a socket is attached to the engine and not to the namespace');
        });

        it('is the bridge when packaged, and socket.io when not', function () {
            //the whole point of the shim: no plugin downstream can tell, and
            //this is the one place that is allowed to look
            if (app.isPackaged) assert.equal(typeof io.attach, 'undefined', 'that looks like socket.io');
            else assert.ok(io.engine, 'socket.io has an engine');
        });
    });

    register();
}
module.exports = plugin;
