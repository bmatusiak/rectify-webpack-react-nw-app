var { Server } = require('socket.io');
var fanout = require('./fanout');

//THE APP HAS TWO KINDS OF CLIENT AND ONE SET OF HANDLERS.
//
//The nw window is on ../bridge, a direct channel between main and the page. A
//browser looking at the same app is on socket.io over http. ./serve.js should
//not know that, so this half hands the rest of the app a single `io` and
//./fanout.js spreads what it is told across whatever is actually there.
//
//THE WINDOW IS ON THE BRIDGE IN EVERY BUILD, not only when packaged. That is
//what makes development behave the way a package does: turn the browser viewer
//off and the app is running exactly the code path it will ship with. It used to
//be `BUILD_PROD ? bridge : socket.io`, so the transport nobody ships was the one
//every day of development exercised.
//
//this half only creates them -- the handlers are in ./server.js, which reloads.

plugin.consumes = ['http', 'bridge'];
plugin.provides = ['io'];
async function plugin(imports, register) {
    var http = imports.http;

    //ATTACHED EVEN WHEN NOTHING MAY CONNECT, because the tray can switch the
    //browser viewer on while the app is running and there would otherwise be
    //nothing to switch on. A socket.io server on a port that is not listening
    //costs a few objects and refuses nobody, because nobody can reach it.
    var browsers = new Server(http.server);

    //THE GATE. A refused connection gets an error rather than a silent hang, so
    //a browser pointed at an app with the viewer off is told why.
    browsers.use(function (socket, next) {
        if (http.serving) return next();
        next(new Error('the browser viewer is off'));
    });

    //AND TURNING IT OFF DROPS WHOEVER IS ALREADY THERE. Refusing new connections
    //while leaving old ones live would make the tray item a lie: the point of
    //switching it off is that nothing outside this window is talking to the app.
    var watching = http.onServing(function (on) {
        if (!on) try { browsers.disconnectSockets(true); } catch (e) { /* none */ }
    });

    var io = fanout([imports.bridge.io, browsers]);

    await register(null, {
        io: io,
        onDestroy: function () {
            watching();
            try { io.close(); } catch (e) { /* already gone */ }
        }
    });
}
module.exports = plugin;
