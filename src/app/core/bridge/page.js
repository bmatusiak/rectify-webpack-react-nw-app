var wire = require('./wire');

//the page end of the bridge. Not a plugin, and named page.js for that reason:
//window.js is the filename that says "this is the window half of a plugin", and
//the loader tried to boot this as one the moment it was called that.
//
//src/app/core/io/window.js decides which transport this window is on and calls
//here. main injected `window.__host` before any of this ran, so finding it is
//how the page knows main is on the other end -- and a browser looking at the
//same url cannot produce one, which is what makes it proof rather than a hint.
//
//NOTHING HERE LISTENS FOR `message`. Main was handed this page's receiver when
//it said hello, and calls straight into it.

module.exports = function bridge() {
    var host = window.__host;
    if (!host) return null;

    var channel = wire(function (line) { host.post(line); });

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

    //AND NOW THAT THE PAGE CAN HEAR, HAND MAIN THE EAR.
    //
    //This used to be a bare hello, with main talking back over postMessage and
    //this file listening for `message`. Two things were wrong with that: a
    //postMessage can be refused (chromium did, quietly, once a page in this app
    //rendered an iframe) and a `message` listener takes events from anything
    //that can reach this window without a word about who sent them. A function
    //only main was ever given cannot be reached by anything else at all.
    host.hello({
        post: function (line) { channel.receive(String(line)); }
    });

    return socket;
};
