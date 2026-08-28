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

    //---- where a call came from ------------------------------------------
    //
    //THE FOUNDATION EVERY GUARD IN THIS APP STANDS ON, and until now nothing
    //tested it. ../may/deciding.js has exactly one path to a yes and this stamp
    //is what it reads; ../../debug-snapshot, ../http's `serve` and every MCP
    //tool refuse or ask on the strength of it.
    //
    //A BROKEN STAMP BREAKS NOTHING VISIBLY. Nothing crashes, no test fails, no
    //dialog appears -- every guarded capability simply starts saying yes, which
    //is the one failure mode a permission system is not allowed to have.
    describe('where a call came from', function () {

        var probe = 'probe-ipc-from-' + process.pid;
        var seen = null;

        function watching(fn) {
            seen = null;
            var handle = ipc.handle(probe, function (data, from) { seen = from; return 'noted'; });

            return Promise.resolve().then(fn).then(
                function (out) { handle.remove(); return out; },
                function (e) { handle.remove(); throw e; });
        }

        it('tells a handler that the control socket asked', async function () {
            await watching(async function () {
                await attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 2, command: probe }
                ]);
            });

            assert.ok(seen, 'the handler was given nothing to say where the call came from');
            assert.equal(seen.overTheWire, true, 'a call over the socket was not marked as one');
        });

        //THE STAMP IS A SECOND ARGUMENT AND NOT A FIELD ON THE DATA, and this is
        //why: the data belongs to whoever sent it. If the stamp lived in there,
        //`{"overTheWire":false}` would be one line in a json message away from
        //being a person at the window -- and every guard in the app with it.
        it('cannot be told otherwise by the caller', async function () {
            await watching(async function () {
                await attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 3, command: probe, data: { overTheWire: false, window: true, trusted: true } }
                ]);
            });

            assert.ok(seen, 'the handler was never reached');
            assert.equal(seen.overTheWire, true,
                'a caller talked its way out of being over the wire, which is every guard in the app');
            assert.ok(!seen.trusted, 'a caller claimed the browser had trusted it');
        });

        //SOMETHING INSIDE THE PROCESS ASKING ITSELF A QUESTION IS NOT A CALLER
        //TO BE SUSPICIOUS OF. Getting this backwards would be the safe failure
        //-- everything asks -- but it would make the app unusable by itself.
        it('says an in-process call did not come over the wire', async function () {
            await watching(function () { return ipc.invoke(probe, {}); });

            assert.ok(seen, 'the handler was never reached');
            assert.equal(seen.overTheWire, false, 'the app asking itself was taken for the socket');
        });

        //AND A CALLER THAT KNOWS BETTER IS BELIEVED. ../bridge hands on what the
        //page said about the press, and ../may reads it -- so `invoke` passing
        //its own default over the top would throw that away and a person's press
        //would stop counting as one.
        it('passes on what an in-process caller said about itself', async function () {
            await watching(function () {
                return ipc.invoke(probe, {}, { window: true, trusted: true });
            });

            assert.ok(seen, 'the handler was never reached');
            assert.equal(seen.window, true, 'what the caller said about itself was thrown away');
            assert.equal(seen.trusted, true);
        });
    });

    //---- and the gate a closed build hangs on it --------------------------
    //
    //THE STANCE IS ../may's AND THE HOOK IS ../ipc's, so this is the half that
    //can be checked WITHOUT a closed build -- which matters more than it looks.
    //A closed build behaves differently from every build a developer runs, so a
    //check that needed one would be a check that runs about once a release.
    //
    //INSTALLING ITS OWN GATE IS THE TRICK. The rule under test is "a gate that
    //says no is obeyed", and that is true in either stance -- ../may simply
    //installs a gate that says yes to everything while the build is open.

    describe('a gate on the control socket', function () {
        var probe = 'probe-gated-' + process.pid;
        var free = 'probe-free-' + process.pid;

        function withGate(names, run) {
            var handles = names.map(function (name) {
                return ipc.handle(name, function () { return 'ran'; });
            });

            var gate = ipc.gate(function (name) {
                return name === probe ? 'the probe gate says no' : null;
            });

            return Promise.resolve(run()).then(function (out) {
                gate.remove(); handles.forEach(function (h) { h.remove(); });
                return out;
            }, function (e) {
                gate.remove(); handles.forEach(function (h) { h.remove(); });
                throw e;
            });
        }

        it('refuses a command it says no to, in the words the gate used', async function () {
            var replies = await withGate([probe, free], function () {
                return attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 1, command: probe }
                ]);
            });

            assert.equal(replies.length, 2, 'no answer to the gated command');
            assert.equal(replies[1].ok, false, 'the gate was ignored');
            assert.ok(String(replies[1].error).indexOf('probe gate') >= 0, replies[1].error);
        });

        it('lets everything else through, so it is a gate and not a wall', async function () {
            var replies = await withGate([probe, free], function () {
                return attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 1, command: free }
                ]);
            });

            assert.equal(replies[1].ok, true, replies[1].error);
            assert.equal(replies[1].result, 'ran');
        });

        //THE APP ASKING ITSELF IS NOT A CALLER TO BE SUSPICIOUS OF. `invoke`
        //carries `{ overTheWire: false }` and must not be gated -- gating it
        //would mean a closed build could not use its own commands, which is not
        //hardening, it is breaking the app to keep it safe from itself.
        it('does not stand between the app and its own commands', async function () {
            var out = await withGate([probe], function () { return ipc.invoke(probe, {}); });
            assert.equal(out, 'ran', 'the gate refused an in-process call');
        });

        //ASKED BEFORE THE HANDLER IS LOOKED UP. Looking up first reads better
        //and hands out a map: a caller could tell a refused command from one
        //that does not exist, and learn the whole surface a name at a time.
        it('answers a gated name the same whether or not anything registers it', async function () {
            var replies = await withGate([], function () {
                return attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 1, command: probe }
                ]);
            });

            assert.equal(replies[1].ok, false);
            assert.ok(String(replies[1].error).indexOf('probe gate') >= 0,
                'a gated command that is not registered said "unknown" instead: ' + replies[1].error);
        });

        //AND THE LISTING AGREES WITH THE GATE. A caller that cannot use a
        //command has no business being told it is there -- and `commands` is
        //the first thing anything driving an app asks for.
        it('leaves a gated command out of the listing', async function () {
            var replies = await withGate([probe, free], function () {
                return attempt([
                    { command: 'auth', data: { token: secret() } },
                    { id: 1, command: 'commands' }
                ]);
            });

            var listed = replies[1].result || [];
            assert.ok(listed.indexOf(free) >= 0, 'an ungated command was hidden');
            assert.ok(listed.indexOf(probe) < 0, 'a gated command was advertised');
        });

        it('is gone when it is removed, rather than for the rest of the run', async function () {
            await withGate([probe], function () { return null; });

            var handle = ipc.handle(probe, function () { return 'ran'; });

            var replies = await attempt([
                { command: 'auth', data: { token: secret() } },
                { id: 1, command: probe }
            ]);

            handle.remove();
            assert.equal(replies[1].ok, true, 'the gate outlived its remover: ' + replies[1].error);
        });
    });

    register();
}
module.exports = plugin;
