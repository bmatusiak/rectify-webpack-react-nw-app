var http = require('http');
var express = require('express');

//one express app, one server. plugins mount on a router rather than on the app
//itself, so the whole set of routes can be thrown away and rebuilt when the
//server half reloads.

plugin.consumes = ['app'];
plugin.provides = ['http'];
async function plugin(imports, register) {

    //a packaged build serves nothing to nobody. The window is opened out of the
    //package rather than over a port, so there is no listener, no express, and
    //nothing on the machine that can reach this app by opening a socket to it.
    //
    //the service still exists because the graph is the same in both builds;
    //what it does not do is listen.
    if (BUILD_PROD) {
        //a plugin is free to mount a route without asking which build it is in.
        //there is nowhere for that route to be reached from, so it goes here
        //instead of throwing -- an app that will not start because one plugin
        //offered an endpoint nobody can call is the worse failure.
        //
        //`url` being null is the honest signal, and what the tray and the
        //window check before offering to open anything.
        var nowhere = function () {
            var stub = {};
            ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use', 'route', 'param']
                .forEach(function (verb) { stub[verb] = function () { return stub; }; });
            return stub;
        };

        return register(null, {
            http: {
                express: null, server: null, url: null,
                app: nowhere(), router: nowhere(),
                swapRouter: nowhere,
                listen: function () { return Promise.resolve(null); }
            }
        });
    }

    var expressApp = express();
    var server = http.createServer(expressApp);

    var router = express.Router();
    expressApp.use(function (req, res, next) { router(req, res, next); });

    var url = null;

    await register(null, {
        http: {
            express: express,
            app: expressApp,
            server: server,

            get url() { return url; },
            get router() { return router; },

            //a fresh router, so routes from the previous load do not stack up
            swapRouter: function () {
                router = express.Router();
                return router;
            },

            listen: function () {
                var host = process.env.HOST || 'localhost';
                //0 means "whatever is free". nothing depends on a fixed port, so
                //two of these can run side by side. set PORT to pin it.
                var port = process.env.PORT || 0;

                return new Promise(function (resolve, reject) {
                    server.once('error', function (e) {
                        if (e.code == 'EADDRINUSE')
                            console.error('port ' + port + ' is already taken. another copy is probably still running.');
                        reject(e);
                    });
                    server.listen(port, host, function () {
                        url = 'http://' + host + ':' + server.address().port + '/';
                        resolve(url);
                    });
                });
            }
        },
        onDestroy: function () {
            try { server.close(); } catch (e) { /* already gone */ }
        }
    });
}
module.exports = plugin;
