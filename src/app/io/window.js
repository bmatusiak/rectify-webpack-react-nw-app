var { io: connect } = require('socket.io-client');
var serve = require('./serve');
var mockPair = require('./mock');
var bridge = require('../bridge/page');
var showError = require('../../overlay');

//the window has no node in it, so everything the node side knows arrives over
//this socket.

plugin.consumes = [];
plugin.provides = ['io', 'appPackage'];
async function plugin(imports, register) {

    //?mock runs ./serve.js in the page instead of talking to a socket — the
    //real server code against a fake wire, not a second implementation of it.
    //deliberately opt in: falling back to it on a failed connection silently
    //served made up data whenever the server was merely slow.
    if (new URLSearchParams(location.search).has('mock')) {
        var mock = mockPair();
        serve(mock.io, { title: 'mock', name: 'mock', version: '0.0.0' });
        var mocked = await new Promise(function (resolve) { mock.socket.once('app', resolve); });
        return register(null, { io: mock.socket, appPackage: mocked });
    }

    //a packaged build has no server to connect to: the window was opened out
    //of the package rather than over http, and main is on the other end of a
    //message channel instead. it says so by injecting window.__host before any
    //of this ran, which is what ./bridge/window looks for.
    var bridged = bridge();
    if (bridged) {
        var carried = await new Promise(function (resolve) { bridged.once('app', resolve); });
        return register(null, { io: bridged, appPackage: carried });
    }

    var socket = connect({ timeout: 4000 });

    //the node half reloads by dropping everyone, and whether they come back on
    //their own depends on how they were dropped: socket.io-client retries a
    //connection that closed under it, but treats a disconnect the server asked
    //for as final. saying so out loud earns its line -- a page that is still on
    //screen and no longer attached to anything looks exactly like a working one
    //until you click something.
    socket.on('disconnect', function (reason) {
        console.log('socket disconnected: ' + reason);
        if (reason == 'io server disconnect') socket.connect();
    });

    socket.io.on('reconnect', function (n) { console.log('socket back after ' + n + ' attempts'); });

    //the node side tells us when its half failed to reload, at which point the
    //page is talking to a server that no longer has any handlers
    socket.on('server:error', function (e) {
        showError('the server half failed to reload', e && e.message);
    });

    var appPackage = await new Promise(function (resolve, reject) {
        socket.once('app', resolve);
        socket.once('connect_error', function (err) {
            reject(new Error('no server answered on ' + location.origin +
                '. add ?mock to run the server half in the page instead. (' + err.message + ')'));
        });
    });

    await register(null, { io: socket, appPackage });
}
module.exports = plugin;
