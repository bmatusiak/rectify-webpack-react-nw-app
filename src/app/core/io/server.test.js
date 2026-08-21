var harness = require('@bmatusiak/rectify/harness.js');

//io's server half is thin on purpose: the socket.io server belongs to main.js,
//and this registers the handlers on it and takes them off again on reload. What
//is worth pinning is the handshake -- a page that connects is told what app it
//has reached before it asks, because it has no other way to find out.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'io', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { app, io, appPackage } = imports;
    var host = app.host;

    describe('io, server side', function () {

        it('is the server main.js owns, not one of its own', function () {
            assert.equal(io, host.io);
        });

        it('is listening for a page to arrive', function () {
            var socket = host.fakeSocket('probe-listening');
            host.io.connect(socket);

            assert.ok(socket.sent.length > 0, 'a connection was not noticed at all');
            socket.disconnect();
        });

        it('tells a page which app it reached, unasked', function () {
            //the window has no node in it and no other way to learn this
            var socket = host.fakeSocket('probe-handshake');
            host.io.connect(socket);

            var greeting = socket.lastSent('app');
            assert.ok(greeting, 'no app was sent: ' + socket.sent.map(function (m) { return m.event; }).join(', '));
            assert.equal(greeting.data.name, appPackage.name);
            assert.equal(greeting.data.version, appPackage.version);

            socket.disconnect();
        });

        it('answers a ping with the pid, so the page can prove it reached a process', function () {
            var socket = host.fakeSocket('probe-ping');
            host.io.connect(socket);

            var answer = null;
            var asked = socket.say('ping', {}, function (reply) { answer = reply; });

            assert.ok(asked, 'nothing was listening for ping');
            assert.ok(answer && answer.pong === true, JSON.stringify(answer));
            assert.equal(answer.pid, process.pid);

            socket.disconnect();
        });
    });

    register();
}
module.exports = plugin;
