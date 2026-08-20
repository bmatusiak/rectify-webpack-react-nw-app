var wire = require('./wire');

//the packaged build has no http server and no socket.io. The window is opened
//straight out of the package and talks to this half by passing messages: main
//to page over postMessage, page to main over a function injected before any of
//the page's own script runs.
//
//what it hands the rest of the app is shaped like a socket.io server, because
//every plugin's server half is already written against that and none of them
//should have to know which build they are in. It is a small shim over ./wire,
//not an implementation of socket.io -- what is here is what the app uses.

var PREFIX = 'rectify:';

plugin.consumes = ['app'];
plugin.provides = ['bridge'];
async function plugin(imports, register) {
    var app = imports.app;

    //the window half, built before packaging and carried inside main.bin as a
    //string. it is evaluated into the page rather than loaded from a file,
    //which is what keeps javascript off disk with no server to serve it from.
    var source = null;
    if (BUILD_PROD) {
        var assets = require('../../../dist/assets.json');
        source = assets['window.js'];
    }

    var connection = [];//listeners for 'connection', socket.io style
    var sockets = new Map();
    var current = null;

    function fire(list, arg) { list.slice().forEach(function (fn) { fn(arg); }); }

    function attach(win) {
        detach();

        var post = null;//set once the page exists
        var waiting = [];

        //anything said before the page can hear is kept rather than dropped.
        //chromium refuses a postMessage to a window it has not finished
        //setting up, quietly and with a console warning, and a message lost
        //there would be the handshake itself.
        var channel = wire(function (line) {
            if (post) post(PREFIX + line);
            else waiting.push(line);
        });

        //before any of the page's own script runs, so the page can never find
        //itself without a way home
        win.on('document-start', function (frame) {
            frame.__host = {
                post: function (line) { channel.receive(String(line)); },
                hello: function () { open(channel); }
            };
        });

        //and once there is a document to render into, the window half is
        //evaluated in it
        win.on('document-end', function (frame) {
            post = function (line) {
                try { frame.postMessage(line, '*'); } catch (e) { /* gone */ }
            };

            while (waiting.length) post(PREFIX + waiting.shift());
            if (source) win.eval(null, source);
        });

        win.on('closed', function () { close(); });
        current = { win: win, channel: channel, waiting: waiting };
    }

    //what the rest of the app sees: one socket, appearing when the page says
    //hello and disappearing when the window closes
    function open(channel) {
        if (sockets.size) return;//already introduced

        var socket = {
            id: 'window',
            on: channel.on, once: channel.once, off: channel.off,
            emit: channel.emit,
            removeAllListeners: function (event) { channel.off(event); },
            disconnect: function () { close(); },
            get connected() { return sockets.size > 0; }
        };

        sockets.set(socket.id, socket);
        fire(connection, socket);
    }

    function close() {
        var socket = sockets.get('window');
        if (!socket) return;

        sockets.delete('window');
        //socket.io tells its own listeners, so this one does too
        if (current) current.channel.receive(JSON.stringify({ event: 'disconnect' }));
    }

    function detach() {
        close();
        current = null;
    }

    //the parts of socket.io's Server that this app actually calls
    var io = {
        on: function (event, fn) { if (event == 'connection') connection.push(fn); },
        off: function (event, fn) {
            if (event != 'connection') return;
            var i = connection.indexOf(fn);
            if (i >= 0) connection.splice(i, 1);
        },
        removeAllListeners: function (event) {
            if (!event || event == 'connection') connection.length = 0;
        },
        emit: function (event, data, ack) {
            sockets.forEach(function (s) { s.emit(event, data, ack); });
        },
        disconnectSockets: function () { close(); },
        close: function () { detach(); },
        get sockets() { return { sockets: sockets }; },
        get engine() { return { clientsCount: sockets.size }; }
    };

    await register(null, {
        bridge: {
            io: io,
            attach: attach,
            detach: detach,
            get connected() { return sockets.size > 0; },

            //the visible window's page, which is a file with no script in it.
            //everything executable arrives by eval from main.bin.
            page: 'view.html'
        },
        onDestroy: detach
    });
}
module.exports = plugin;
