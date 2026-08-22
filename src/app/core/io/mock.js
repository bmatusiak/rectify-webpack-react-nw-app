//A MOCK MADE OF THE REAL SERVER CODE, rather than a second implementation of
//it. The usual way is to write stub answers in the window and hope they keep
//matching ./serve.js; these are two endpoints wired to each other, so the
//window runs the actual server half against them when nothing answers on the
//wire. A stub drifts silently -- this one cannot, because there is only one
//set of answers in the app.

function endpoint() {
    var handlers = {};
    return {
        peer: null,
        id: 'mock',
        on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); return this; },
        once: function (name, fn) {
            var self = this;
            var wrap = function () { self.off(name, wrap); fn.apply(null, arguments); };
            return self.on(name, wrap);
        },
        off: function (name, fn) {
            if (!handlers[name]) return this;
            handlers[name] = handlers[name].filter(function (h) { return h != fn; });
            return this;
        },
        emit: function (name) {
            var args = Array.prototype.slice.call(arguments, 1);
            var peer = this.peer;
            setTimeout(function () {
                (peer.$handlers[name] || []).slice().forEach(function (fn) { fn.apply(null, args); });
            }, 0);
            return this;
        },
        get $handlers() { return handlers; }
    };
}

//returns { io, socket }: `io` looks like the socket.io server (io.on('connection')),
//`socket` looks like the client's connected socket.
module.exports = function mockPair() {
    var serverSide = endpoint();
    var clientSide = endpoint();
    serverSide.peer = clientSide;
    clientSide.peer = serverSide;

    var io = {
        on: function (name, fn) {
            if (name == 'connection') setTimeout(function () { fn(serverSide); }, 0);
            return io;
        },
        emit: function () { serverSide.emit.apply(serverSide, arguments); return io; }
    };

    return { io, socket: clientSide };
};
