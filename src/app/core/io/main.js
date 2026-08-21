var { Server } = require('socket.io');

//socket.io lives on the http server. this half only creates it — the handlers
//are in ./server.js, which reloads, and the connection is in ./window.js.

plugin.consumes = ['http', 'bridge'];
plugin.provides = ['io'];
async function plugin(imports, register) {

    //a packaged build has no http server for socket.io to live on. what it has
    //instead is a message channel to the window, wearing the same api -- see
    //src/app/bridge. Nothing downstream of here can tell the difference.
    var io = BUILD_PROD ? imports.bridge.io : new Server(imports.http.server);

    await register(null, {
        io: io,
        onDestroy: function () {
            try { io.close(); } catch (e) { /* already gone */ }
        }
    });
}
module.exports = plugin;
