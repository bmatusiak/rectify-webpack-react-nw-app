//ONE `io`, OVER HOWEVER MANY TRANSPORTS THERE ARE.
//
//The nw window and a browser looking at the same app do not arrive the same
//way. The window is on ./../bridge -- a direct channel between main and the page
//-- and a browser is on socket.io over http. Both are clients of the same app,
//and ./serve.js should register its handlers once, not once per transport.
//
//SO THE PLUGIN GETS A SINGLE OBJECT SHAPED LIKE SOCKET.IO'S SERVER, and this
//spreads what it is told across whatever is actually there. With the browser
//viewer switched off there is exactly one transport and this costs a function
//call; with it on there are two and nothing above here changes.
//
//WHAT IT IS NOT is a merge of socket.io. It implements the parts this app calls
//and no more -- the same discipline as ./../bridge/main.js, and for the same
//reason: a shim big enough to be wrong is worse than no shim.

module.exports = function fanout(parts) {
    var live = parts.filter(Boolean);

    //REGISTERED ONCE, PERMANENTLY, at construction. `removeAllListeners` below
    //clears the app's handlers and deliberately leaves these alone: the server
    //half hands its listeners back on every reload, and if that took this one
    //with it the next build would never hear a connection again.
    var connection = [];
    live.forEach(function (part) {
        part.on('connection', function (socket) {
            connection.slice().forEach(function (fn) { fn(socket); });
        });
    });

    function each(fn) {
        live.forEach(function (part) {
            try { fn(part); } catch (e) { /* one transport already gone */ }
        });
    }

    return {
        //how many, and of what -- so a test or a page can say which way it came
        get transports() { return live.length; },

        //AND A HANDLER REGISTERED LATE IS TOLD WHAT IS ALREADY HERE.
        //
        //The node half is torn down and rebuilt on every save, so ./serve.js
        //registers this again on each reload -- and by then the nw window has
        //long since connected. Over socket.io that was invisible: the reload
        //drops every client and the client reconnects, which fires `connection`
        //again. The bridge has no reconnect, because its peer never left; the
        //window simply stopped being mentioned to anyone, and the new build sat
        //there with no clients at all.
        //
        //ONLY WHAT IS STILL CONNECTED, so this cannot double-deliver: a
        //socket.io client dropped by the reload is already out of the map by the
        //time the next handler registers, and comes back the ordinary way.
        on: function (event, fn) {
            if (event != 'connection') return;
            connection.push(fn);

            var already = this.sockets.sockets;
            already.forEach(function (socket) {
                try { fn(socket); } catch (e) { console.error('a connection handler threw', e && e.stack || e); }
            });
        },

        off: function (event, fn) {
            if (event != 'connection') return;
            var i = connection.indexOf(fn);
            if (i >= 0) connection.splice(i, 1);
        },

        removeAllListeners: function (event) {
            if (!event || event == 'connection') connection.length = 0;
        },

        emit: function (event, data, ack) {
            each(function (part) { part.emit(event, data, ack); });
        },

        disconnectSockets: function (close) {
            each(function (part) { if (part.disconnectSockets) part.disconnectSockets(close); });
        },

        close: function () {
            each(function (part) { if (part.close) part.close(); });
        },

        //BUILT FRESH ON EVERY READ, because the underlying maps are the real
        //ones and a snapshot taken at construction would be a lie by the time
        //anybody looked at it. `selftest/main.js` walks this to find the page.
        get sockets() {
            var all = new Map();
            each(function (part) {
                var map = part.sockets && part.sockets.sockets;
                if (map && map.forEach) map.forEach(function (socket, id) { all.set(id, socket); });
            });
            return { sockets: all };
        },

        //socket.io counts transports here and the bridge counts its one page.
        //A part that offers no engine is asked for its socket map instead, which
        //is the same question in the only other words available.
        get engine() {
            var count = 0;
            each(function (part) {
                if (part.engine && typeof part.engine.clientsCount == 'number') count += part.engine.clientsCount;
                else if (part.sockets && part.sockets.sockets) count += part.sockets.sockets.size;
            });
            return { clientsCount: count };
        }
    };
};
