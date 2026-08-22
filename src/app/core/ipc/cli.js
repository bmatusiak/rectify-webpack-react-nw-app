var fs = require('fs');
var net = require('net');
var endpoint = require('./endpoint');

//NO DEPENDENCIES, WHICH IS MOST OF WHY THE CLI IS ON A PIPE AND NOT THE SOCKET
//THE WINDOW USES. socket.io-client would work and would put a package, a
//handshake and a reconnect policy between typing a command and getting an
//answer. This is plain node writing lines to a pipe, so `node src/cli.js status`
//starts, answers and exits without loading anything that could be out of date.

var NL = String.fromCharCode(10);

plugin.consumes = ['app'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var address = endpoint(imports.app.appPackage.name);
    var tokenFile = endpoint.token(imports.app.appPackage.name);
    var nextId = 1;

    //the app writes this where only this account can read it. no file means
    //either nothing is running or it is running as somebody else, and both are
    //better said than guessed at.
    function token() {
        try { return fs.readFileSync(tokenFile, 'utf8').trim(); }
        catch (e) { return null; }
    }

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
                //every connection introduces itself first. it is one extra line
                //on a socket that is already open, and it means a command can
                //never arrive on an untrusted one.
                socket.write(JSON.stringify({ command: 'auth', data: { token: token() } }) + NL);
                socket.write(JSON.stringify({ id: id, command: command, data: data || {} }) + NL);
            });

            socket.on('data', function (chunk) {
                buffer += chunk;

                var lines = buffer.split(NL);
                buffer = lines.pop();

                for (var i = 0; i < lines.length; i++) {
                    if (!lines[i]) continue;

                    var msg;
                    try { msg = JSON.parse(lines[i]); }
                    catch (e) { clearTimeout(timer); socket.end(); return reject(new Error('bad reply: ' + lines[i])); }

                    //the first reply answers the introduction, and only says
                    //something worth hearing when it went badly
                    if (msg.id === undefined) {
                        if (msg.ok) continue;
                        clearTimeout(timer); socket.end();
                        return reject(new Error(msg.error ||
                            'the app would not accept this token. is ' + tokenFile + ' the running one?'));
                    }

                    clearTimeout(timer);
                    socket.end();
                    if (msg.ok) return resolve(msg.result);
                    return reject(new Error(msg.error || 'failed'));
                }
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
