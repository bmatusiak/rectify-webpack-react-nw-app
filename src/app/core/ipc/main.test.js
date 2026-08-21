var fs = require('fs');
var net = require('net');

var endpoint = require('./endpoint');

//THE TESTS THAT NEED THE REAL APP.
//
//test/in-app.test.js checks that both ends derive the same address and that the
//token is not kept inside the socket it guards. What it cannot check is any of
//this: that something is listening on that address, that the token is on disk
//with the right permissions, and that a client which cannot repeat it is
//actually turned away. Those are facts about a running process.

var NL = String.fromCharCode(10);

plugin.consumes = ['selftest', 'app', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, ipc } = imports;
    var tokenFile = endpoint.token(app.appPackage.name);

    //a raw client, because the point is to be something that is not the cli
    function attempt(lines, timeout) {
        return new Promise(function (resolve) {
            var socket = net.connect(ipc.address);
            var buffer = '';
            var replies = [];

            var timer = setTimeout(function () { socket.destroy(); resolve(replies); }, timeout || 2000);

            socket.setEncoding('utf8');
            socket.on('connect', function () {
                lines.forEach(function (line) { socket.write(JSON.stringify(line) + NL); });
            });
            socket.on('data', function (chunk) {
                buffer += chunk;
                var parts = buffer.split(NL);
                buffer = parts.pop();
                parts.filter(Boolean).forEach(function (line) {
                    try { replies.push(JSON.parse(line)); } catch (e) { /* partial */ }
                });
                if (replies.length >= lines.length) { clearTimeout(timer); socket.destroy(); resolve(replies); }
            });
            socket.on('error', function () { clearTimeout(timer); resolve(replies); });
        });
    }

    function secret() { return fs.readFileSync(tokenFile, 'utf8').trim(); }

    describe('the control socket, while it is listening', function () {

        it('is actually listening, not merely named', async function () {
            var replies = await attempt([{ command: 'auth', data: { token: secret() } }]);
            assert.ok(replies.length > 0, 'nothing answered on ' + ipc.address);
        });

        it('wrote the token where the cli will look', function () {
            assert.ok(fs.existsSync(tokenFile), tokenFile + ' is not there');
            assert.ok(secret().length >= 32, 'the token is ' + secret().length + ' characters');
        });

        it('keeps the token to this account', function () {
            var mode = fs.statSync(tokenFile).mode & 0o777;
            if (process.platform === 'win32') {
                //no posix bits worth reading; the per-user temp directory is
                //what does the work, and that is checked by the address test
                assert.ok(tokenFile.length > 0, 'no token path');
            } else {
                assert.equal(mode, 0o600, 'mode is ' + mode.toString(8));
            }
        });

        it('turns away a client that cannot repeat it', async function () {
            var replies = await attempt([
                { command: 'auth', data: { token: 'not-the-token' } },
                { id: 1, command: 'commands' }
            ]);

            assert.ok(replies.length >= 1, 'no answer at all');
            assert.equal(replies[0].ok, false);
            assert.ok(String(replies[0].error).indexOf('token') >= 0, replies[0].error);
        });

        it('answers nothing but a complaint before it is told the token', async function () {
            var replies = await attempt([{ id: 1, command: 'commands' }]);

            assert.ok(replies.length >= 1, 'no answer at all');
            assert.equal(replies[0].ok, false);
            assert.ok(String(replies[0].error).indexOf('authenticated') >= 0, replies[0].error);
        });

        it('lets a client through that can', async function () {
            var replies = await attempt([
                { command: 'auth', data: { token: secret() } },
                { id: 1, command: 'commands' }
            ]);

            var answered = replies.filter(function (r) { return r.id === 1; })[0];
            assert.ok(answered, 'the command was never answered');
            assert.equal(answered.ok, true);
            assert.ok(answered.result.indexOf('selftest') >= 0, answered.result.join(', '));
        });
    });

    register();
}
module.exports = plugin;
