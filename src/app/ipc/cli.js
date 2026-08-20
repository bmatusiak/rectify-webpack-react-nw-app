var net = require('net');
var endpoint = require('./endpoint');

//the other end of the control socket, for src/cli.js.
//
//no dependencies: the cli is plain node talking to a pipe, which is most of
//the reason for choosing one over the socket the window uses.

var NL = String.fromCharCode(10);

plugin.consumes = ['app'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var address = endpoint(imports.app.appPackage.name);
    var nextId = 1;

    function call(command, data, timeout) {
        return new Promise(function (resolve, reject) {
            var id = nextId++;
            var socket = net.connect(address);
            var buffer = '';
            var timer = setTimeout(function () {
                socket.destroy();
                reject(new Error('no answer to "' + command + '" within ' + (timeout || 5000) + 'ms'));
            }, timeout || 5000);

            socket.setEncoding('utf8');

            socket.on('connect', function () {
                socket.write(JSON.stringify({ id: id, command: command, data: data || {} }) + NL);
            });

            socket.on('data', function (chunk) {
                buffer += chunk;
                var line = buffer.split(NL)[0];
                if (buffer.indexOf(NL) < 0) return;//still arriving

                clearTimeout(timer);
                socket.end();

                var msg;
                try { msg = JSON.parse(line); } catch (e) { return reject(new Error('bad reply: ' + line)); }
                if (msg.ok) resolve(msg.result);
                else reject(new Error(msg.error || 'failed'));
            });

            socket.on('error', function (e) {
                clearTimeout(timer);
                reject(e.code == 'ENOENT' || e.code == 'ECONNREFUSED'
                    ? new Error('the app is not running')
                    : e);
            });
        });
    }

    await register(null, {
        ipc: {
            address: address,
            call: call,

            //cheap enough to ask rather than parse an instance file
            running: function () {
                return call('commands', {}, 1500).then(function () { return true; },
                    function () { return false; });
            }
        }
    });
}
module.exports = plugin;
