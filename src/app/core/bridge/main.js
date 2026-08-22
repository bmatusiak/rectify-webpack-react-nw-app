var wire = require('./wire');

//BOTH DIRECTIONS ARE DIRECT CALLS, and neither is postMessage.
//
//main plants a function on the page's global before any of the page's own
//script runs; the page hands its own receiver back when it says hello. nw gives
//main the page's actual Window object -- `frame === win.window`, measured --
//so there is no need to go through the message bus in either direction.
//
//It used to postMessage one way, which cost two things. Chromium can refuse a
//postMessage (see isTop below) and does it with a console warning rather than a
//throw, so messages went missing silently. And a `message` listener takes
//events from anything that can reach the window, with no check on who sent
//them -- a door that does not need to exist.
//
//what it hands the rest of the app is shaped like a socket.io server, because
//every plugin's server half is already written against that and none of them
//should have to know which build they are in. It is a small shim over ./wire,
//not an implementation of socket.io -- what is here is what the app uses.

plugin.consumes = ['app'];
plugin.provides = ['bridge'];
async function plugin(imports, register) {
    var app = imports.app;

    //the window half, built before packaging and carried inside main.bin as a
    //string. it is evaluated into the page rather than loaded from a file,
    //which is what keeps javascript off disk with no server to serve it from.
    var source = null;
    if (BUILD_PROD) {
        var assets = require('../../../../dist/assets.json');
        source = assets['window.js'];
    }

    var connection = [];//listeners for 'connection', socket.io style
    var sockets = new Map();
    var current = null;

    function fire(list, arg) { list.slice().forEach(function (fn) { fn(arg); }); }

    function attach(win) {
        detach();

        //THE PAGE'S OWN RECEIVER, once it has installed one. Until then anything
        //said is kept rather than dropped: main is ready before the page is, and
        //the message lost in that gap would be the handshake itself.
        var page = null;
        var waiting = [];

        //DELIVERED ON THE NEXT TICK, NOT THIS ONE. A direct call is synchronous
        //and postMessage was not, and that difference is load-bearing: the page
        //says hello from inside ./page.js, and only AFTER that does
        //../io/window.js register the listener waiting for the handshake. Main
        //answers `hello` by firing `connection`, which makes ./serve.js emit
        //`app` immediately -- so a synchronous delivery arrived before anything
        //was listening, the wire dropped it for want of a handler, and the page
        //sat on a white screen forever waiting for a message it had already
        //been sent.
        //
        //A microtask is enough and costs nothing: it runs once the caller's own
        //work is finished, which is exactly when the page is ready. They queue
        //in order, so this does not reorder anything.
        //
        //It is also what a socket does. Nothing that talks over one expects a
        //message to arrive in the same tick it was sent, and a transport that
        //behaves otherwise is a trap for the next person.
        function deliver(line) {
            var text = String(line);
            Promise.resolve().then(function () {
                if (!page) return;//the page went away while this was in flight
                try { page.post(text); }
                catch (e) { console.error('the page could not take a message', e && e.stack || e); }
            });
        }

        var channel = wire(function (line) {
            if (page) deliver(line);
            else waiting.push(line);
        });

        //ONLY THE TOP DOCUMENT. document-start and document-end fire for every
        //frame in the window, iframes included -- the docs say `frame` is the
        //iframe object, and in nw 0.114 it is that frame's Window, so there is
        //nothing about the object itself that says which one it is.
        //
        //THIS WAS NOT A THEORETICAL HAZARD. The demo's Markdown page renders its
        //document into a srcdoc iframe; that iframe fired document-end, main
        //dutifully repointed at it, and from then on everything main said went
        //to the iframe instead of the page. Chromium refused those with
        //"Cross-Origin-Opener-Policy policy would block the window.postMessage
        //call" into a log nobody reads, and the app simply stopped answering --
        //while looking perfectly fine on screen. Visiting one page broke the
        //whole window.
        //ASKED OF THE FRAME, NOT OF THE WINDOW. The first version of this
        //compared against `win.window`, which is right until the page reloads:
        //during document-start for the NEW document, win.window still refers to
        //the old one, so the guard rejected the very page it exists to protect.
        //`__host` was never injected, the page could not find the bridge, fell
        //through to socket.io, and was refused by a viewer that is off -- which
        //surfaced as the window reporting itself a browser, four steps from the
        //cause.
        //
        //A top-level document is its own parent. An iframe's parent is the page
        //holding it, and a cross-origin one throws rather than answering, which
        //is also a no.
        function isTop(frame) {
            if (!frame) return false;

            //THE CHEAP ANSWER FIRST, AND IT CAN ONLY BE A TRUE POSITIVE. If this
            //frame IS the window's own, it is the top one. A stale win.window --
            //which is what it is during document-start for a reload -- is a
            //different object, so it says false rather than lying.
            //
            //Asking it first also keeps chromium quiet: reading `frame.parent`
            //in a packaged build is met with "Cross-Origin-Opener-Policy policy
            //would block the window.parent call" every time, warned into a log
            //somebody is trying to read.
            try { if (frame === win.window) return true; }
            catch (e) { /* cannot even compare: ask the frame instead */ }

            try { return frame.parent === frame; }
            catch (e) { /* refused: fall through */ }

            //AND WHEN CHROMIUM REFUSES TO ANSWER. In a packaged build reading
            //`frame.parent` is met with "Cross-Origin-Opener-Policy policy would
            //block the window.parent call" -- a console warning, not a throw
            //that says what it wants, and the frame is left unclassified.
            //
            //Neither would answer, so it is not ours to inject into. Without
            //this pair the packaged window was classified as not-top, skipped
            //injection at document-start, and worked only because `loaded` puts
            //the way home back afterwards. Working by luck is not the same as
            //working.
            return false;
        }

        //before any of the page's own script runs, so the page can never find
        //itself without a way home
        function onStart(frame) {
            if (!isTop(frame)) return;

            //a reload starts a new page, and the old one's receiver is dead.
            //Delivering to it would be talking to a document that has gone.
            arrived();
            frame.__host = host();
        }

        //A RELOADED PAGE IS A NEW CLIENT, and has to be introduced as one.
        //
        //Without this the old socket was still in the map, so `open` below took
        //its early return, `connection` never fired again, ./serve.js never
        //emitted the handshake -- and the page sat on a white screen with no
        //error anywhere, waiting for a message main had decided it did not need
        //to send. Closing first is what a socket does when the far end goes
        //away, which is exactly what a reload is.
        function arrived() {
            close();
            page = null;
        }

        //THE SAME WAY HOME, BUILT FRESH FOR WHOEVER ASKS.
        function host() {
            return {
                post: function (line) { channel.receive(String(line)); },

                //THE PAGE HANDS ITS RECEIVER OVER RATHER THAN MAIN REACHING FOR
                //ONE, so there is exactly one moment when main knows the page
                //can hear it, and it is the moment the page says so.
                hello: function (receiver) {
                    page = receiver || null;
                    while (page && waiting.length) deliver(waiting.shift());
                    open(channel);
                }
            };
        }

        //AND AGAIN WHEN THE PAGE COMES BACK, BECAUSE document-start DOES NOT.
        //
        //Measured: nw fires document-start once per document, and a full page
        //reload -- which webpack does in development whenever it cannot hot swap
        //a module -- does not fire it again. So `__host` was injected on the
        //first load and never afterwards: the page came back, could not find the
        //bridge, fell through to socket.io and was refused by a viewer that is
        //off. The window sat on an error overlay after an ordinary save.
        //
        //`loaded` does fire on every load, but LATE -- after the page's own
        //scripts have run. That is why ../io/window.js waits a moment for the
        //bridge rather than deciding on its first look: main is putting it back
        //while the page is asking.
        function onLoaded() {
            var frame = null;
            try { frame = win.window; } catch (e) { return; }
            if (!frame || frame.__host) return;

            arrived();
            frame.__host = host();
        }

        //and once there is a document to render into, the window half is
        //evaluated in it
        function onEnd(frame) {
            if (!isTop(frame)) return;
            if (source) win.eval(null, source);
        }

        function onClosed() { close(); }

        win.on('document-start', onStart);
        win.on('document-end', onEnd);
        win.on('loaded', onLoaded);
        win.on('closed', onClosed);

        //NAMED AND KEPT, so detach() can take them off again. See the note there.
        current = { win: win, channel: channel, waiting: waiting, onStart: onStart, onEnd: onEnd, onLoaded: onLoaded, onClosed: onClosed };
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

    //THE PREVIOUS ATTACHMENT IS TAKEN OFF, NOT JUST FORGOTTEN.
    //
    //This used to null `current` and leave the listeners on the window. Every
    //attach after the first then left another document-end handler behind, each
    //closing over the frame it saw -- so `post` ended up pointing at whichever
    //fired last, which could be a document that had already gone. Chromium
    //refuses that one with
    //
    //    Cross-Origin-Opener-Policy policy would block the window.postMessage call
    //
    //and refuses it QUIETLY, into a log nobody was reading: main went silent
    //towards the page, the page kept answering nothing, and `click` and `read`
    //timed out against a window that was plainly working on screen. Found in a
    //packaged build, where reopening the window is the ordinary way to get it
    //back and so the second attach is not an edge case.
    function detach() {
        close();

        if (current && current.win) {
            try {
                current.win.removeListener('document-start', current.onStart);
                current.win.removeListener('document-end', current.onEnd);
                current.win.removeListener('loaded', current.onLoaded);
                current.win.removeListener('closed', current.onClosed);
            } catch (e) { /* the window is already gone, which is the same thing */ }
        }

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
        //A NO-OP, AND THAT IS NOT LAZINESS.
        //
        //../io/server.js calls this on every reload so that clients come back
        //onto the new handlers. Over socket.io they really do go away and really
        //do reconnect. Here there is nothing to go away FROM: main and the page
        //are the same window, the channel is a function call, and the peer is
        //still sitting there. Dropping the socket would end the conversation for
        //good, because nothing on the page's side knows how to start it again --
        //there is no socket.io-client here to retry.
        //
        //What makes the reload work instead is ../io/fanout.js handing a newly
        //registered handler whatever is already connected. See the note there.
        disconnectSockets: function () { },
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
            page: 'view.html',

            //THE WINDOW HALF, FOR ANYONE ELSE WHO HAS TO HAND IT OUT. This
            //window gets it by eval and needs no url -- but a BROWSER viewer in
            //a packaged build has no other way to it, since the point of the
            //package is that there is no javascript on disk. ../build serves it
            //from here rather than reading dist/assets.json a second time.
            get source() { return source; }
        },
        onDestroy: detach
    });
}
module.exports = plugin;
