var { io: connect } = require('socket.io-client');
var serve = require('./serve');
var mockPair = require('./mock');
var bridge = require('../bridge/page');
var showError = require('../../../overlay');

//the window has no node in it, so everything the node side knows arrives over
//this socket.

plugin.consumes = [];
plugin.provides = ['io'];
async function plugin(imports, register) {

    //?mock runs ./serve.js in the page instead of talking to a socket — the
    //real server code against a fake wire, not a second implementation of it.
    //deliberately opt in: falling back to it on a failed connection silently
    //served made up data whenever the server was merely slow.
    if (new URLSearchParams(location.search).has('mock')) {
        var mock = mockPair();
        serve(mock.io, { title: 'mock', name: 'mock', version: '0.0.0' });
        mock.socket.appPackage = await new Promise(function (resolve) { mock.socket.once('app', resolve); });
        return register(null, { io: mock.socket });
    }

    //THE NW WINDOW IS ON THE BRIDGE IN EVERY BUILD, and main says so by putting
    //`window.__host` there. A browser looking at the same url cannot produce
    //one, so finding it is proof of which kind of view this is.
    //
    //WAITED FOR, NOT GLANCED AT. nw fires document-start once per document and
    //NOT on a reload, so after webpack full-reloads the page main has to put the
    //way home back on `loaded` -- which arrives after this code has already run.
    //Deciding on the first look meant an ordinary save left the window on an
    //error overlay, having fallen through to a socket.io server that is off.
    //
    //HALF A SECOND, ON A TIMER, NOT IN ANIMATION FRAMES.
    //
    //This was requestAnimationFrame, on the reasoning that it is a race with
    //main rather than with a network. It is, and rAF still cannot be used to
    //measure it: chromium does not run animation frames for a window nobody is
    //looking at. A browser view opens, goes behind the app window, and stops
    //being animated -- so the loop never advanced, the page never fell through
    //to socket.io, and it sat there forever having logged nothing at all. No
    //error, no overlay, just a viewer that never arrived.
    //
    //A timer is throttled in a background window and still fires, which is the
    //difference that matters.
    var bridged = null;
    for (var tries = 0; tries < 30 && !bridged; tries++) {
        bridged = bridge();
        if (!bridged) await new Promise(function (r) { setTimeout(r, 16); });
    }

    if (bridged) {
        bridged.appPackage = await new Promise(function (resolve) { bridged.once('app', resolve); });
        return register(null, { io: bridged });
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

    //the handshake payload rides the connection, so it is kept on the
    //connection. ../appPackage/window.js is what hands it out as a service, so
    //that wanting the app's name does not mean consuming a socket.
    socket.appPackage = await new Promise(function (resolve, reject) {
        socket.once('app', resolve);
        socket.once('connect_error', function (err) {
            reject(new Error('no server answered on ' + location.origin +
                '. add ?mock to run the server half in the page instead. (' + err.message + ')'));
        });
    });

    await register(null, { io: socket });
}
module.exports = plugin;
