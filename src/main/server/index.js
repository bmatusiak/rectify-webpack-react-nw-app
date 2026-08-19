var http = require('http');
var express = require('express');
var { Server } = require('socket.io');

//the http side: one express app, one server, one socket.io on top of it.
//
//plugins mount on a router rather than on the app itself, so the whole set of
//routes can be thrown away and rebuilt when the server bundle reloads.

plugin.consumes = ['app'];
plugin.provides = ['server'];
async function plugin(imports, register) {

    var expressApp = express();
    var httpServer = http.createServer(expressApp);
    var io = new Server(httpServer);

    var router = express.Router();
    expressApp.use(function (req, res, next) { router(req, res, next); });

    var url = null;

    var server = {
        express: express,
        app: expressApp,
        http: httpServer,
        io: io,

        get url() { return url; },
        get router() { return router; },

        //a fresh router, so routes from the previous load do not stack up
        swapRouter: function () {
            router = express.Router();
            return router;
        },

        listen: function (host, port) {
            return new Promise(function (resolve, reject) {
                httpServer.once('error', reject);
                httpServer.listen(port, host, function () {
                    url = 'http://' + host + ':' + httpServer.address().port + '/';
                    resolve(url);
                });
            });
        }
    };

    await register(null, {
        server: server,
        onDestroy: function () {
            try { io.close(); } catch (e) { /* already gone */ }
            try { httpServer.close(); } catch (e) { /* already gone */ }
        }
    });
}
module.exports = plugin;
