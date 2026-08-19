var mockPair = require('./mock');

//one plugin, both halves.
//
//  node    main.js handed the socket.io server in on the `app` service
//  browser connects back to it, and if nothing answers it runs the server half
//          above against an in-memory pair instead — see ./mock.js
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
        return register(null, { io: app.io, appPackage: app.appPackage });
    }

    //---- browser half -----------------------------------------------------
    var { io: connect } = require('socket.io-client');

    var socket = connect({ timeout: 2000, reconnectionAttempts: 2 });

    var appPackage = await new Promise(function (resolve) {
        socket.once('app', resolve);

        socket.once('connect_error', function () {
            socket.close();
            console.warn('[io] nothing on the wire, running the server half in a mock');
            var mock = mockPair();
            serve(mock.io, { title: 'mock', name: 'mock', version: '0.0.0' });
            socket = mock.socket;
            socket.once('app', resolve);
        });
    });

    await register(null, { io: socket, appPackage });
}
module.exports = plugin;
