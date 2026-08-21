var { io: connect } = require('socket.io-client');

//io's server half is thin on purpose: the socket.io server belongs to main.js,
//and this registers the handlers on it and takes them off again on reload.
//
//running inside the app means the handshake can be tested by DOING it -- a real
//client, on the real server, over the real port. Against a mock this was a fake
//socket handed to a listener, which proved the listener was attached and
//nothing about whether anything could reach it.

plugin.consumes = ['selftest', 'app', 'io', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, io, appPackage } = imports;
    var host = app.host;

    //a second client of this app's own server, which is what the window is
    function visit(fn, timeout) {
        var url = host.window.url;
        var socket = connect(url, { transports: ['websocket'], timeout: 4000 });

        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                socket.close();
                reject(new Error('no answer from ' + url + ' within ' + (timeout || 5000) + 'ms'));
            }, timeout || 5000);

            socket.once('app', function (greeting) {
                clearTimeout(timer);
                Promise.resolve()
                    .then(function () { return fn(socket, greeting); })
                    .then(function (out) { socket.close(); resolve(out); },
                        function (e) { socket.close(); reject(e); });
            });

            socket.once('connect_error', function (e) {
                clearTimeout(timer);
                socket.close();
                reject(new Error('could not connect: ' + e.message));
            });
        });
    }

    describe('io, server side', function () {

        it('is the server main.js owns, not one of its own', function () {
            assert.equal(io, host.io);
        });

        it('has a page connected to it already', function () {
            //the window opened before these ran, so the app is its own proof
            assert.ok(host.io.engine.clientsCount > 0, 'nothing is connected');
        });

        it('tells a client which app it reached, unasked', async function () {
            var greeting = await visit(function (socket, said) { return said; });

            assert.equal(greeting.name, appPackage.name);
            assert.equal(greeting.version, appPackage.version);
        });

        it('answers a ping with the pid of the process really answering', async function () {
            var answer = await visit(function (socket) {
                return new Promise(function (resolve) { socket.emit('ping', {}, resolve); });
            });

            assert.ok(answer && answer.pong === true, JSON.stringify(answer));
            assert.equal(answer.pid, process.pid);
        });

        it('counts a client while it is there and forgets it after', async function () {
            var before = host.io.engine.clientsCount;
            await visit(function () { return true; });

            //a disconnect is not instant and a fixed wait is a guess. Wait for
            //the number to come back rather than for the clock.
            var deadline = Date.now() + 5000;
            while (host.io.engine.clientsCount > before && Date.now() < deadline) {
                await new Promise(function (r) { setTimeout(r, 100); });
            }

            assert.equal(host.io.engine.clientsCount, before, 'a client was left behind');
        });
    });

    register();
}
module.exports = plugin;
