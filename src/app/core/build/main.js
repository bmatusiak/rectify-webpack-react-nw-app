//how the app's two other halves get in front of you.
//
//  development   webpack builds them here, serves the window half from memory
//                and reloads the node half in place on every save
//  packaged      both were built before packaging. the window half rides along
//                inside this bundle as a string, and the node half is simply
//                required — there is nothing to watch and nothing to reload
//
//BUILD_PROD is a constant webpack replaces, so only one of these branches is
//in the packaged bundle. it gates the requires directly rather than sitting
//inside a function, because webpack collects a dependency wherever it can
//reach it — a `require('webpack')` in an unreachable function is still bundled,
//and dragging webpack into a packaged app is exactly what this avoids.

plugin.consumes = ['app', 'http', 'io', 'window', 'tray', 'ipc', 'lifecycle'];
plugin.provides = ['build'];
async function plugin(imports, register) {
    var { app, http, io, window: win, tray, ipc, lifecycle } = imports;

    //what the node half is handed. the window and the tray are passed as
    //controllers rather than objects, because they outlive the bundle.
    var host = {
        //which of the three builds this is, so the node half can say so
        isPackaged: !!app.isPackaged,
        root: app.root,

        express: http.express,
        router: http.router,
        httpServer: http.server,
        io: io,
        appPackage: app.appPackage,

        window: {
            get url() { return http.url; },
            get isOpen() { return win.isOpen; },
            open: function () { win.show(); },
            show: function () { win.show(); },
            hide: function () { win.hide(); },
            openInBrowser: function () { if (http.url) nw.Shell.openExternal(http.url); },
            capture: function (options) { return win.capture(options); },
            quit: function (reason) { lifecycle.shutdown(reason || 'asked to quit'); }
        },

        tray: {
            add: function (options) { return tray.add(options); },
            labels: function () { return tray.labels(); }
        },

        //the control socket, forwarded rather than handed over: the listener
        //lives in main and outlives this bundle, so the node half gets the four
        //calls it needs and not the socket itself.
        ipc: {
            get address() { return ipc.address; },
            handle: function (name, fn) { return ipc.handle(name, fn); },
            invoke: function (name, data) { return ipc.invoke(name, data); },
            commands: function () { return ipc.commands(); }
        }
    };

    var ready;

    if (BUILD_PROD) {

        //---- packaged ---------------------------------------------------

        //nothing to serve. The window half is evaluated into the page by
        //src/app/bridge, and the stylesheets sit beside the app as files the
        //page loads relatively -- so a packaged build opens no port at all.
        //
        //no separate bundle to load either, and no reason to reload it
        ready = require('../../../server.js')(host);

    } else {

        //---- development ------------------------------------------------

        var path = require('path');
        var webpack = require('webpack');
        var devMiddleware = require('webpack-dev-middleware');
        var hotMiddleware = require('webpack-hot-middleware');
        var configs = require('../../../../webpack.config.js');

        var built = configs({}, { mode: process.env.NODE_ENV });
        var windowConfig = built.find(function (c) { return c.name == 'window'; });
        var serverConfig = built.find(function (c) { return c.name == 'server'; });

        var compiler = webpack(windowConfig);
        http.app.use(devMiddleware(compiler, { publicPath: windowConfig.output.publicPath }));
        http.app.use(hotMiddleware(compiler));

        var bundlePath = path.join(serverConfig.output.path, serverConfig.output.filename);
        var loaded = null;

        var load = async function () {
            if (loaded) {
                await loaded.destroy();//rectify runs each plugin's onDestroy, backwards
                loaded = null;
            }

            host.router = http.swapRouter();

            delete require.cache[require.resolve(bundlePath)];
            loaded = await require(bundlePath)(host);
        };

        //one reload at a time. watch() fires again while a load is still
        //awaiting, and two overlapping loads are the double registration all of
        //this exists to prevent.
        var queue = Promise.resolve();

        var first = null;
        ready = new Promise(function (resolve, reject) { first = { resolve, reject }; });

        webpack(serverConfig).watch({}, function (err, stats) {
            if (err) return first ? first.reject(err) : console.error(err);
            if (stats.hasErrors()) {
                var e = new Error(stats.toString({ all: false, errors: true }));
                return first ? first.reject(e) : console.error(String(e.message));
            }
            console.log('server bundle built in ' + (stats.endTime - stats.startTime) + 'ms');

            queue = queue.then(function () {
                return load().then(function () {
                    if (first) { first.resolve(); first = null; }
                    else console.log('server half reloaded');
                }, function (e) {
                    if (first) { first.reject(e); first = null; return; }
                    //the old half is already torn down, so the app is serving
                    //the window and nothing else. say so on screen, not just here.
                    console.error('server half failed to reload', e && e.stack || e);
                    io.emit('server:error', { message: String(e && e.stack || e) });
                });
            }, function () { /* the previous reload already reported itself */ });
        });
    }

    await register(null, {
        build: {
            //src/boot.js waits on this before it listens, so the handlers are
            //up before anything can connect
            ready: function () { return ready; }
        }
    });
}
module.exports = plugin;
