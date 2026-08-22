//the page's end of the socket. Which transport it got is decided here and
//nowhere else: socket.io when the window was served over http, the bridge when
//it was opened straight out of the package. Nothing downstream can tell, which
//is the design -- so this is the one place allowed to look.

plugin.consumes = ['selftest', 'io'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var io = imports.io;

    describe('io, in the page', function () {

        it('is connected to something', function () {
            assert.equal(io.connected, true);
        });

        it('answers a round trip to the node half', async function () {
            var pong = await new Promise(function (resolve, reject) {
                var timer = setTimeout(function () { reject(new Error('no pong within 5s')); }, 5000);
                io.emit('ping', {}, function (reply) { clearTimeout(timer); resolve(reply); });
            });

            assert.ok(pong && pong.pong === true, JSON.stringify(pong));
            assert.ok(pong.pid, 'no pid, so nothing on the other side is a process');
        });

        //THE WINDOW IS ON THE BRIDGE, WHATEVER IT WAS OPENED FROM.
        //
        //This used to assert the opposite for development -- http page, so
        //socket.io -- which meant the transport the app ships with was the one
        //nobody exercised until it was packaged. Now main injects `__host` into
        //this window in every build, and the page prefers it. In development the
        //page is still FETCHED over http, because that is how webpack hot
        //reloads it; what does not go over http is the app's own traffic.
        it('is on the bridge, however this window was opened', function () {
            assert.ok(window.__host, 'main never injected a way home');
            assert.equal(typeof window.__host.post, 'function');

            //the socket handed out is the bridge's, not socket.io's: socket.io's
            //client carries a manager with a real `on`, and the shim's is a stub
            //because there is no connection to have opinions about
            assert.equal(io.connected, true, 'the bridge is not connected');
            assert.equal(typeof io.io.on, 'function');
            assert.equal(io.id, undefined, 'that looks like a socket.io client');
        });
    });

    register();
}
module.exports = plugin;
