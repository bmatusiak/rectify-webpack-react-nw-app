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

        it('took the transport that matches how this window was opened', function () {
            var bridged = !!window.__host;
            var served = location.protocol.indexOf('http') === 0;

            //a page served over http has a server to talk to; one opened out of
            //the package has main on the other end of a message channel
            assert.equal(bridged, !served,
                'opened from ' + location.protocol + ' but ' + (bridged ? 'bridged' : 'on socket.io'));
        });
    });

    register();
}
module.exports = plugin;
