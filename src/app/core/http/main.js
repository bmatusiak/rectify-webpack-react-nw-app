var http = require('http');
var express = require('express');

//one express app, one server, and two separate facts about it.
//
//LISTENING is whether there is a port at all. In development there always is,
//because webpack serves the window half over it and hot reloads it; in a
//packaged build there is one only if somebody asked for it.
//
//SERVING is whether a browser may be a CLIENT -- whether socket.io will take a
//connection and the tray offers to open one. It can be turned off while the
//server is still listening, which is exactly the development case: webpack keeps
//its port, and the app behaves the way a package does.
//
//THE NW WINDOW IS ON NEITHER OF THESE. It talks to main over ../bridge in every
//build, so none of this decides whether the app works -- only whether a second
//viewer can join.

plugin.consumes = ['app'];
plugin.provides = ['http'];
async function plugin(imports, register) {
    var app = imports.app;

    //ALWAYS BUILT, EVEN WHEN NOTHING WILL EVER LISTEN. This used to hand back a
    //stub whose every verb returned itself, so that a plugin could mount a route
    //in a packaged build without asking. That was the right instinct and the
    //wrong mechanism: a real express app that nothing can reach costs a few
    //objects, behaves identically, and can be switched on later -- which a stub
    //never could, and which is what the tray's toggle needs.
    var expressApp = express();
    var server = http.createServer(expressApp);

    var router = express.Router();
    expressApp.use(function (req, res, next) { router(req, res, next); });

    var url = null;
    var serving = !!app.serve;
    var watchers = [];

    //WHERE TO LISTEN, KEPT SEPARATELY FROM WHETHER TO. src/serve.js answers
    //false or an address, and the address has to outlive a `false` -- the tray
    //can switch the viewer off and on again, and it should come back where it
    //was asked for rather than wherever happens to be free the second time.
    //
    //Environment beats nothing and loses to an explicit address, so PORT still
    //pins a build that was not told one.
    var where = app.serve || {};
    var HOST = where.host || process.env.HOST || 'localhost';
    var PORT = where.port != null ? where.port : (process.env.PORT || 0);

    function announce() {
        watchers.slice().forEach(function (fn) {
            try { fn(serving); } catch (e) { console.error('a serving watcher threw', e && e.stack || e); }
        });
    }

    function listen() {
        if (url) return Promise.resolve(url);

        return new Promise(function (resolve, reject) {
            function failed(e) {
                if (e.code == 'EADDRINUSE')
                    console.error('port ' + PORT + ' is already taken. another copy is probably still running.');
                reject(e);
            }
            server.once('error', failed);
            server.listen(PORT, HOST, function () {
                server.removeListener('error', failed);
                //ASKED FOR THE PORT RATHER THAN ASSUMING IT, because 0 means
                //"whatever is free" and the answer is only known now
                url = 'http://' + HOST + ':' + server.address().port + '/';
                resolve(url);
            });
        });
    }

    //STOPPING CANNOT HANG, AND IT WOULD.
    //
    //server.close() does not call back while a connection is still open, and
    //closeAllConnections is not on every node this might run under -- so on the
    //one where it is missing, turning the viewer off would never return. That is
    //a tray item that stays stuck and, worse, an `await` in the node half that
    //never resolves and takes the whole test run with it.
    //
    //So it is raced. Either the server closed or it did not; both are said, and
    //neither leaves a caller waiting.
    function stop() {
        if (!url) return Promise.resolve(null);

        return new Promise(function (resolve) {
            var settled = false;
            function done(why) {
                if (settled) return;
                settled = true;
                url = null;
                if (why) console.error('the http server did not close cleanly: ' + why);
                resolve(null);
            }

            var timer = setTimeout(function () { done('still had connections after 3s'); }, 3000);
            if (timer && timer.unref) timer.unref();

            try { server.closeAllConnections && server.closeAllConnections(); }
            catch (e) { /* older node: the timeout above is the backstop */ }

            try { server.close(function () { clearTimeout(timer); done(null); }); }
            catch (e) { clearTimeout(timer); done(e && e.message); }
        });
    }

    await register(null, {
        http: {
            express: express,
            app: expressApp,
            server: server,

            get url() { return url; },
            get listening() { return !!url; },

            //where it will listen, or is listening. A caller that wants to say
            //so -- the tray's tooltip, the demo's System page -- should not have
            //to take the url apart to find out.
            get host() { return HOST; },
            get port() { return url ? server.address().port : PORT; },
            get router() { return router; },

            //a fresh router, so routes from the previous load do not stack up
            swapRouter: function () {
                router = express.Router();
                return router;
            },

            //WHETHER A BROWSER MAY BE A CLIENT. ../io reads this to decide
            //whether to take a socket, and the tray reads it to label its item.
            get serving() { return serving; },

            //TURNING IT OFF DOES NOT ALWAYS STOP LISTENING, and that asymmetry
            //is the point: development needs the port for webpack whatever the
            //answer is. A packaged build has nothing else using it, so off means
            //off, and the app goes back to having no port at all.
            //
            //AND IF IT THROWS, THE ANSWER GOES BACK TO WHAT IT WAS. Leaving
            //`serving` true because listen() failed would put a tick beside a
            //menu item for a server that is not there.
            setServing: async function (on) {
                on = !!on;
                if (on === serving) return serving;

                var was = serving;
                serving = on;

                try {
                    if (on) await listen();
                    else if (app.isPackaged) await stop();
                } catch (e) {
                    serving = was;
                    announce();
                    throw e;
                }

                announce();
                return serving;
            },

            onServing: function (fn) {
                watchers.push(fn);
                return function () {
                    var i = watchers.indexOf(fn);
                    if (i >= 0) watchers.splice(i, 1);
                };
            },

            //src/boot.js calls this. Development listens either way, because
            //webpack has nowhere else to put the window half; a packaged build
            //listens only if it was asked to serve.
            listen: function () {
                if (!app.isPackaged || serving) return listen();
                return Promise.resolve(null);
            }
        },
        onDestroy: function () {
            watchers.length = 0;
            try { server.close(); } catch (e) { /* never listened */ }
        }
    });
}
module.exports = plugin;
