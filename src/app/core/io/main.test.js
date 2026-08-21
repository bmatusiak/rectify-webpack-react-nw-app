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

        it('has the window on it', function () {
            //the window opened and connected before any of this ran, so the app
            //having got this far is itself the setup
            assert.ok(io.engine.clientsCount > 0, 'nothing is connected');
        });

        it('counts the same sockets two ways', function () {
            assert.equal(io.sockets.sockets.size, io.engine.clientsCount);
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
