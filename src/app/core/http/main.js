var http = require('http');
var express = require('express');

//TWO FACTS, NOT ONE BOOLEAN -- see ./README.md for what each one means. One
//flag cannot describe development: webpack needs the port to exist and hot
//reload over it, while the app needs to behave like a package, which means
//refusing browsers. Collapsing them means either no hot reload or no way to
//test the code a package ships with.
//
//THE NW WINDOW IS ON NEITHER OF THEM. It talks to main over ../bridge in every
//build, so nothing here decides whether the app works -- only whether a second
//viewer may join. That is what makes turning it off safe enough to be a tray
//item somebody can click by accident.

plugin.consumes = ['app', 'ipc'];
plugin.provides = ['http'];
async function plugin(imports, register) {
    var app = imports.app;
    var ipc = imports.ipc;

    //ALWAYS BUILT, EVEN WHEN NOTHING WILL EVER LISTEN. This used to hand back a
    //stub whose every verb returned itself, so that a plugin could mount a route
    //in a packaged build without asking. That was the right instinct and the
    //wrong mechanism: a real express app that nothing can reach costs a few
    //objects, behaves identically, and can be switched on later -- which a stub
    //never could, and which is what the tray's toggle needs.
    var expressApp = express();
    var server = http.createServer(expressApp);

    //THE GATE, IN FRONT OF THE APP'S OWN ROUTES.
    //
    //With the viewer off, nothing outside this window may reach the app: no
    //socket.io (../io refuses it) and no api. Requests fall through rather than
    //being answered here, because webpack's middleware is mounted after this and
    //still has to serve the window its bundle -- whatever it does not recognise
    //is refused by the gate installed at the end of listen().
    var router = express.Router();
    expressApp.use(function (req, res, next) {
        if (!serving) return next();
        router(req, res, next);
    });

    var url = null;
    //A BUILD THAT CANNOT SERVE IS NOT SERVING, whatever was asked for. See
    //webpack.config.js: this is a constant, so a binary built with
    //"canServe": false has no routes and no socket.io server inside it at all.
    var serving = BUILD_SERVABLE && !!app.serve;

    if (!BUILD_SERVABLE && app.serve) console.error(
        'this build cannot serve a browser: it was built with "canServe": false. ' +
        'Ignoring the request to serve.');
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

    //ADDED ONCE, AND ONLY WHEN THERE IS SOMETHING BEHIND IT. By the time this
    //runs, src/boot.js has already let ../build mount webpack's middleware, so
    //this sits at the end of the chain: everything webpack recognises has been
    //served, and what is left is the app's own -- which is exactly what the gate
    //above stepped over.
    //
    //A 503 RATHER THAN A 404, because "off" and "not a route" are different
    //facts and somebody reading a log deserves to know which they hit.
    var gated = false;
    function gate() {
        if (gated) return;
        gated = true;

        expressApp.use(function (req, res) {
            if (!serving) return res.status(503).type('text')
                .send('the browser viewer is off. start with --serve, or turn it on from the tray.');
            res.status(404).type('text').send('not found');
        });
    }

    function listen() {
        if (url) return Promise.resolve(url);
        gate();

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

    //THE SAME SWITCH THE TRAY FLIPS, FROM A TERMINAL.
    //
    //`../cli` forwards anything its own table does not know, so this needs no
    //cli half of its own: `npm run cli -- serve '{"on":true}'` reaches here.
    //
    //It exists to be USED -- turning the viewer on from a script, or off again
    //when you are done -- and because a control that can only be reached by
    //clicking a native menu item is a control nothing can check.
    var api = {
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

        //whether it COULD, which is decided when the binary is built
        get servable() { return !!BUILD_SERVABLE; },

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

            //REFUSED OUT LOUD, NOT QUIETLY IGNORED. A switch that appears to
            //work and does nothing is worse than one that is not there: the
            //point of building without the ability is that somebody can be
            //sure, and silence is not proof of anything.
            if (on && !BUILD_SERVABLE) throw new Error(
                'this build cannot serve a browser. It was built with ' +
                '"canServe": false in package.json, so the routes and the ' +
                'socket.io server are not in it to be switched on.');
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
    };

    //THE SAME SWITCH THE TRAY FLIPS, FROM A TERMINAL.
    //
    //`../cli` forwards anything its own table does not know, so this needs no
    //cli half of its own: `npm run cli -- serve '{"on":true}'` reaches here.
    //
    //It exists to be USED -- turning the viewer on from a script, or off again
    //afterwards -- and because a control that can only be reached by clicking a
    //native menu item is a control nothing can check.
    var answered = ipc && ipc.handle('serve', async function (data) {
        if (data && typeof data.on != 'undefined') await api.setServing(!!data.on);
        return { serving: api.serving, listening: api.listening, url: api.url, host: api.host, port: api.port };
    });

    await register(null, {
        http: api,
        onDestroy: function () {
            watchers.length = 0;
            if (answered) answered.remove();
            try { server.close(); } catch (e) { /* never listened */ }
        }
    });
}
module.exports = plugin;
