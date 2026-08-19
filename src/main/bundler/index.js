var path = require('path');
var webpack = require('webpack');
var devMiddleware = require('webpack-dev-middleware');
var hotMiddleware = require('webpack-hot-middleware');

var configs = require('../../../webpack.config.js');

//webpack, the server half reload, and the order the app starts in.
//
//this one consumes everything, so rectify runs it last, and its setup is the
//startup sequence: build, load the node half, listen, then show a window.

plugin.consumes = ['app', 'server', 'window', 'tray', 'lifecycle'];
plugin.provides = [];
async function plugin(imports, register) {
    var { app, server, window: win, tray, lifecycle } = imports;

    var built = configs({}, { mode: process.env.NODE_ENV });
    var clientConfig = built.find(function (c) { return c.name == 'client'; });
    var serverConfig = built.find(function (c) { return c.name == 'server'; });

    var HOST = process.env.HOST || 'localhost';
    //0 means "whatever is free". nothing depends on a fixed port, so two of
    //these can run side by side. set PORT to pin it.
    var PORT = process.env.PORT || 0;

    var clientCompiler = webpack(clientConfig);
    server.app.use(devMiddleware(clientCompiler, { publicPath: clientConfig.output.publicPath }));
    server.app.use(hotMiddleware(clientCompiler));

    //---- what the app's own plugins get handed --------------------------

    var host = {
        express: server.express,
        router: server.router,
        httpServer: server.http,
        io: server.io,
        appPackage: app.appPackage,

        //the window and the tray outlive the bundle being reloaded, so the app
        //side gets a controller rather than the objects. src/core/nw wraps this
        //as a service and takes back whatever it added.
        nw: !win ? undefined : {
            get url() { return server.url; },
            get hasWindow() { return win.isOpen; },
            open: function () { win.show(); },
            show: function () { win.show(); },
            hide: function () { win.hide(); },
            openInBrowser: function () { if (server.url) nw.Shell.openExternal(server.url); },
            quit: function (reason) { lifecycle.shutdown(reason || 'asked to quit'); },
            tray: {
                add: function (options) { return tray.add(options); },
                labels: function () { return tray.labels(); }
            }
        }
    };

    //---- the node half of every app plugin, built by the second entry ----

    var bundlePath = path.join(serverConfig.output.path, serverConfig.output.filename);
    var loaded = null;

    async function load() {
        if (loaded) {
            await loaded.destroy();//rectify runs each plugin's onDestroy
            loaded = null;
        }

        host.router = server.swapRouter();

        delete require.cache[require.resolve(bundlePath)];
        loaded = await require(bundlePath)(host);
    }

    //one reload at a time. watch() fires again while a load is still awaiting,
    //and two overlapping loads are the double registration all of this exists
    //to prevent.
    var queue = Promise.resolve();
    function enqueue(work) { return (queue = queue.then(work, work)); }

    function watch(onFirst) {
        var first = true;
        webpack(serverConfig).watch({}, function (err, stats) {
            if (err) return first ? onFirst(err) : console.error(err);
            if (stats.hasErrors()) {
                var e = new Error(stats.toString({ all: false, errors: true }));
                return first ? onFirst(e) : console.error(String(e.message));
            }
            console.log('server bundle built in ' + (stats.endTime - stats.startTime) + 'ms');

            enqueue(function () {
                return load().then(function () {
                    if (first) { first = false; onFirst(null); }
                    else console.log('server half reloaded');
                }, function (e) {
                    if (first) { first = false; return onFirst(e); }
                    //the old half is already torn down, so the app is serving
                    //the window and nothing else. say so on screen, not just here.
                    console.error('server half failed to reload', e && e.stack || e);
                    server.io.emit('server:error', { message: String(e && e.stack || e) });
                });
            });
        });
    }

    //---- start ----------------------------------------------------------

    await new Promise(function (resolve) {
        watch(function (err) {
            if (err) {
                console.error(err.stack || err);
                lifecycle.shutdown('the server bundle would not build');
                return resolve();
            }

            server.listen(HOST, PORT).then(function (url) {
                console.log('listening on ' + url);
                lifecycle.publish(url);

                if (win) {
                    if (tray) tray.start();
                    win.open();

                    //nw.js is single instance: a second launch is handed to this
                    //one instead of starting its own
                    nw.App.on('open', function () { win.show(); });
                }
                resolve();
            }, function (e) {
                if (e.code == 'EADDRINUSE')
                    console.error('port ' + PORT + ' is already taken. another copy is probably still running.');
                else
                    console.error(e.stack || e);
                lifecycle.shutdown('the server could not start');
                resolve();
            });
        });
    });

    await register(null, {});
}
module.exports = plugin;
