var fs = require('fs');
var net = require('net');
var endpoint = require('./endpoint');

//the app's control socket: a named pipe on windows, a unix domain socket
//elsewhere. src/cli.js talks to it, and any plugin can answer on it.
//
//it lives here rather than in the reloadable half for the same reason the
//window and the tray do — a reload would otherwise drop every connected client
//and race to re-listen on an address that is still held.
//
//the wire format is one json object per line, in both directions:
//
//    {"id":1,"command":"open","data":{}}
//    {"id":1,"ok":true,"result":null}

var NL = String.fromCharCode(10);

plugin.consumes = ['app'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var app = imports.app;

    var address = endpoint(app.appPackage.name);
    var handlers = {};
    var open = [];

    function handle(name, fn) {
        handlers[name] = fn;
        return { remove: function () { if (handlers[name] === fn) delete handlers[name]; } };
    }

    //so a client can ask what this build understands rather than guessing
    handle('commands', function () { return Object.keys(handlers).sort(); });

    async function dispatch(line, reply) {
        var msg;
        try { msg = JSON.parse(line); } catch (e) { return reply({ ok: false, error: 'not json' }); }

        var fn = handlers[msg.command];
        if (!fn) return reply({ id: msg.id, ok: false, error: 'unknown command: ' + msg.command });

        try {
            var result = await fn(msg.data || {});
            reply({ id: msg.id, ok: true, result: result === undefined ? null : result });
        } catch (e) {
            reply({ id: msg.id, ok: false, error: (e && e.message) || String(e) });
        }
    }

    var server = net.createServer(function (socket) {
        open.push(socket);
        socket.setEncoding('utf8');

        var buffer = '';
        socket.on('data', function (chunk) {
            buffer += chunk;
            var lines = buffer.split(NL);
            buffer = lines.pop();//whatever is left is a partial line
            lines.filter(Boolean).forEach(function (line) {
                dispatch(line, function (out) {
                    if (!socket.destroyed) socket.write(JSON.stringify(out) + NL);
                });
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
            resolve();
        });
    });

    await register(null, {
        ipc: {
            address: address,
            handle: handle,
            commands: function () { return Object.keys(handlers).sort(); }
        },
        onDestroy: function () {
            open.slice().forEach(function (s) { try { s.destroy(); } catch (e) { /* gone */ } });
            try { server.close(); } catch (e) { /* never listened */ }
            if (process.platform != 'win32') {
                try { fs.unlinkSync(address); } catch (e) { /* already gone */ }
            }
        }
    });
}
module.exports = plugin;
