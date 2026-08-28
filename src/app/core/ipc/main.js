var fs = require('fs');
var net = require('net');
var crypto = require('crypto');
var endpoint = require('./endpoint');
var sameToken = require('./token');

//IT LIVES HERE RATHER THAN IN THE RELOADABLE HALF for the same reason the
//window and the tray do — a reload would otherwise drop every connected client
//and race to re-listen on an address that is still held.
//
//the wire format is one json object per line, in both directions:
//
//    {"id":1,"command":"open","data":{}}
//    {"id":1,"ok":true,"result":null}

var NL = String.fromCharCode(10);

plugin.consumes = ['app', 'Plugin'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var app = imports.app;

    //teardown declared beside each thing that needs it, and run in reverse.
    //this one owns four separate resources and used to undo them in a block
    //at the far end of the file, where the ordering was implied by where the
    //lines happened to sit.
    var self = new imports.Plugin('ipc');

    var address = endpoint(app.appPackage.name);
    var handlers = {};
    var open = [];

    //a secret, new every run, written where only this account can read it.
    //a client says it once and the connection is trusted from then on; a
    //client that does not is told so and gets nothing else.
    var secret = crypto.randomBytes(32).toString('hex');
    var tokenFile = endpoint.token(app.appPackage.name);

    try {
        fs.writeFileSync(tokenFile, secret, { mode: 0o600 });
        //writeFileSync only applies the mode when it creates the file, so a
        //leftover from a previous run would keep whatever it had
        fs.chmodSync(tokenFile, 0o600);
        self.own(function () {
            try { fs.unlinkSync(tokenFile); } catch (e) { /* already gone */ }
        });
    } catch (e) {
        console.error('could not write ' + tokenFile + ': ' + (e && e.message));
    }

    //THE RULE IS IN ./token.js, not here. It was written out inline, and
    //./node.test.js had a COPY of it -- three tests about code the app does not
    //run, while the real comparison could have been `return true` with nothing
    //to notice.
    function correct(given) { return sameToken(secret, given); }

    function handle(name, fn) {
        handlers[name] = fn;
        return { remove: function () { if (handlers[name] === fn) delete handlers[name]; } };
    }

    //---- and what a closed build will not let through ----------------------
    //
    //A HOOK RATHER THAN A CONSUMED SERVICE, because the direction will not allow
    //anything else: ../may consumes THIS, so this cannot consume ../may. The
    //same shape as ../../remote/window.js being HANDED its `refusedFor` by the
    //half that has the guard, rather than reaching for one.
    //
    //IT DEFAULTS TO LETTING EVERYTHING PAST, which is not a hole -- ../may
    //installs the real one, and a build with no ../may in it is a build with no
    //stance to enforce. What it must not do is fail open once something IS
    //installed, so the gate is asked for every wire call and never cached.
    var gates = [];

    function gate(fn) {
        gates.push(fn);

        return { remove: function () {
            var i = gates.indexOf(fn);
            if (i >= 0) gates.splice(i, 1);
        } };
    }

    //THE FIRST REFUSAL WINS AND THE REST ARE NOT ASKED. A gate that says no has
    //said everything there is to say, and running the others would only invite
    //a second opinion nobody wants.
    function barred(name) {
        for (var i = 0; i < gates.length; i++) {
            var no = gates[i](name);
            if (no) return no;
        }

        return null;
    }

    //so a client can ask what this build understands rather than guessing -- and
    //in a closed build that is the OPEN ones and no more.
    //
    //ANSWERING WITH ALL OF THEM WOULD BE AN ENUMERATION ORACLE. It is the same
    //surface `tools/list` is on the MCP side, where a hidden tool is not listed
    //at all: a caller that cannot use a command has no business being told it
    //is there, and a list is the first thing anything driving an app asks for.
    handle('commands', function () {
        return Object.keys(handlers).filter(function (name) { return !barred(name); }).sort();
    });

    async function dispatch(line, reply, socket) {
        var msg;
        try { msg = JSON.parse(line); } catch (e) { return reply({ ok: false, error: 'not json' }); }

        if (msg.command == 'auth') {
            socket.trusted = correct(msg.data && msg.data.token);
            return reply({
                id: msg.id, ok: socket.trusted, result: socket.trusted ? 'ok' : null,
                error: socket.trusted ? undefined : 'that is not the token'
            });
        }

        if (!socket.trusted) return reply({
            id: msg.id, ok: false,
            error: 'not authenticated. the token is in ' + tokenFile
        });

        //ASKED BEFORE THE HANDLER IS LOOKED UP, so a closed build answers a
        //command it will not run and a command it has never heard of with the
        //SAME sentence. Looking up first reads better and hands out a map: a
        //caller could tell an unlisted command from a nonexistent one and learn
        //the whole surface a name at a time, which is exactly what filtering
        //`commands` above was for.
        var no = barred(msg.command);
        if (no) return reply({ id: msg.id, ok: false, error: no });

        var fn = handlers[msg.command];
        if (!fn) return reply({ id: msg.id, ok: false, error: 'unknown command: ' + msg.command });

        try {
            //WHERE THIS CAME FROM, HANDED TO THE HANDLER.
            //
            //A handler used to be given the data and nothing else, so nothing
            //in the app could tell a model over the control socket from the app
            //asking itself a question -- and `may` cannot exist without that
            //distinction. See ../may/deciding.js, which has exactly one path to
            //a yes and this is what it reads.
            //
            //A SECOND ARGUMENT RATHER THAN A FIELD ON THE DATA. The data
            //belongs to whoever sent it, so a stamp inside it is a stamp the
            //sender can write -- `{ overTheWire: false }` would be one line in
            //a json message away from being a person.
            var result = await fn(msg.data || {}, { overTheWire: true, socket: socket });
            reply({ id: msg.id, ok: true, result: result === undefined ? null : result });
        } catch (e) {
            reply({ id: msg.id, ok: false, error: (e && e.message) || String(e) });
        }
    }

    self.own(function () {
        open.slice().forEach(function (s) { try { s.destroy(); } catch (e) { /* gone */ } });
    });

    var server = net.createServer(function (socket) {
        open.push(socket);
        socket.setEncoding('utf8');
        socket.trusted = false;

        //a client that connects and says nothing holds a handle open forever
        var greeting = setTimeout(function () {
            if (!socket.trusted) socket.destroy();
        }, 5000);
        socket.once('close', function () { clearTimeout(greeting); });

        var buffer = '';
        socket.on('data', function (chunk) {
            buffer += chunk;
            var lines = buffer.split(NL);
            buffer = lines.pop();//whatever is left is a partial line
            lines.filter(Boolean).forEach(function (line) {
                dispatch(line, function (out) {
                    if (!socket.destroyed) socket.write(JSON.stringify(out) + NL);
                }, socket);
            });
        });

        socket.on('error', function () { /* a client that hung up mid-write */ });
        socket.on('close', function () {
            var i = open.indexOf(socket);
            if (i >= 0) open.splice(i, 1);
        });
    });

    //a hard kill leaves the socket file behind on posix, and listening again
    //then fails with EADDRINUSE even though nothing is holding it
    if (process.platform != 'win32') {
        try { fs.unlinkSync(address); } catch (e) { /* it was not there */ }
    }

    await new Promise(function (resolve) {
        server.once('error', function (e) {
            console.error('ipc not listening on ' + address + ': ' + (e && e.message));
            resolve();//an app without a control socket is still an app
        });
        server.listen(address, function () {
            console.log('ipc listening on ' + address);

            self.own(function () {
                try { server.close(); } catch (e) { /* never listened */ }
                if (process.platform != 'win32') {
                    try { fs.unlinkSync(address); } catch (e) { /* already gone */ }
                }
            });

            resolve();
        });
    });

    await register(null, {
        ipc: self.api({
            address: address,
            handle: handle,

            //WHAT IS REGISTERED, ALL OF IT, WHICH IS NOT WHAT THE WIRE IS TOLD.
            //The `commands` HANDLER answers only the open ones in a closed
            //build; this is the app asking itself, and the screen that lists
            //what a tool can reach needs both lists to say which entries in the
            //config no longer name anything.
            commands: function () { return Object.keys(handlers).sort(); },

            //AND A PLACE TO REFUSE ONE. ../may installs the stance here; see
            //`gate` above for why it is a hook and not a consumed service.
            gate: gate,

            //calling a handler without going through a socket. The window and
            //the cli reach these over the wire; something in this process has
            //no wire to reach them by, and opening a connection to ourselves to
            //ask ourselves a question would be a strange way to do it.
            //`from` SAYS THIS DID NOT COME OVER THE WIRE, which is the whole
            //difference between this and ./dispatch. Something inside the
            //process asking itself a question is not a caller to be suspicious
            //of -- and a handler that guards a capability needs to know which
            //of the two it is talking to.
            invoke: function (name, data, from) {
                var fn = handlers[name];
                if (!fn) return Promise.reject(new Error('no handler for ' + name));

                return Promise.resolve(fn(data || {}, from || { overTheWire: false }));
            }
        }),
        onDestroy: self.unload
    });
}
module.exports = plugin;
