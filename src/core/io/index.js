var mockPair = require('./mock');

//one plugin, both halves.
//
//  node    main.js handed the socket.io server in on the `app` service
//  browser connects back to it. with ?mock it runs the server half above
//          against an in-memory pair instead — see ./mock.js
plugin.consumes = ['app'];
plugin.provides = ['io', 'appPackage'];
async function plugin(imports, register) {
    var { app } = imports;

    //---- server half ------------------------------------------------------
    function serve(io, appPackage) {
        io.on('connection', function (socket) {

            //the window has no node, so it asks for this rather than reading it
            socket.emit('app', appPackage);

            //example call, delete it
            socket.on('ping', function (data, ack) {
                if (ack) ack({ pong: true, pid: (typeof process == 'undefined' ? 'mock' : process.pid) });
            });
        });
    }

    if (app.isServer) {
        serve(app.io, app.appPackage);

        return register(null, {
            io: app.io,
            appPackage: app.appPackage,

            //a server rebuild reloads this file. undo what serve() did and let
            //the clients reconnect onto the new handlers
            onDestroy: function () {
                app.io.removeAllListeners('connection');
                app.io.disconnectSockets();
            }
        });
    }

    //---- browser half -----------------------------------------------------
    var { io: connect } = require('socket.io-client');
    var showError = require('../../overlay');

    //?mock runs the server half above against an in-memory pair instead of a
    //socket. deliberately opt in: falling back to it on a failed connection
    //silently served made up data whenever the server was merely slow.
    if (new URLSearchParams(location.search).has('mock')) {
        var mock = mockPair();
        serve(mock.io, { title: 'mock', name: 'mock', version: '0.0.0' });
        var mocked = await new Promise(function (resolve) { mock.socket.once('app', resolve); });
        return register(null, { io: mock.socket, appPackage: mocked });
    }

    var socket = connect({ timeout: 4000 });

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
