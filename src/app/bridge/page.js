var wire = require('./wire');

//the page end of the bridge. Not a plugin, and named page.js for that reason:
//window.js is the filename that says "this is the window half of a plugin", and
//the loader tried to boot this as one the moment it was called that.
//
//src/app/io/window.js decides which transport this window is on and calls here
//when there is no server to talk to. main injected `window.__host` before any
//of this ran, so finding it is how the page knows which build it is in.

var PREFIX = 'rectify:';

module.exports = function bridge() {
    var host = window.__host;
    if (!host) return null;

    var channel = wire(function (line) { host.post(line); });

    window.addEventListener('message', function (e) {
        if (typeof e.data != 'string' || e.data.indexOf(PREFIX) !== 0) return;
        channel.receive(e.data.slice(PREFIX.length));
    });

    //shaped like a socket.io client socket, because every plugin's window half
    //is written against one and none of them should have to care
    var socket = {
        on: function (event, fn) {
            //there is nothing to connect to and nothing to lose, so the two
            //events about the state of a connection never fire. saying so here
            //is better than leaving a listener that waits forever.
            if (event == 'connect' || event == 'reconnect') return;
            channel.on(event, fn);
        },
        once: channel.once,
        off: channel.off,
        emit: channel.emit,
        connected: true,

        //socket.io hangs its manager here and io/window.js listens on it
        io: { on: function () {}, off: function () {} }
    };

    //and now that the page can hear, tell main it is there
    host.hello();
    return socket;
};
