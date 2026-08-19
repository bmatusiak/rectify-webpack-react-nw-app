var path = require('path');
var webpack = require('webpack');
var devMiddleware = require('webpack-dev-middleware');
var hotMiddleware = require('webpack-hot-middleware');

var configs = require('../../../webpack.config.js');

//webpack, and the reload of the app's node half.
//
//the window half is served from memory and hot reloads itself. the node half is
//a bundle this loads, and reloads by tearing the old one down first — which is
//what every onDestroy in a server.js is for.

plugin.consumes = ['app', 'http', 'io', 'window', 'tray', 'lifecycle'];
plugin.provides = ['build'];
async function plugin(imports, register) {
    var { app, http, io, window: win, tray, lifecycle } = imports;

    var built = configs({}, { mode: process.env.NODE_ENV });
    var clientConfig = built.find(function (c) { return c.name == 'window'; });
    var serverConfig = built.find(function (c) { return c.name == 'server'; });

    var compiler = webpack(clientConfig);
    http.app.use(devMiddleware(compiler, { publicPath: clientConfig.output.publicPath }));
    http.app.use(hotMiddleware(compiler));

    //what the node half is handed. the window and the tray are passed as
    //controllers rather than objects, because they outlive the bundle.
    var host = {
        express: http.express,
        router: http.router,
        httpServer: http.server,
        io: io,
        appPackage: app.appPackage,

        window: !win ? undefined : {
            get url() { return http.url; },
            get isOpen() { return win.isOpen; },
            open: function () { win.show(); },
            show: function () { win.show(); },
            hide: function () { win.hide(); },
            openInBrowser: function () { if (http.url) nw.Shell.openExternal(http.url); },
            quit: function (reason) { lifecycle.shutdown(reason || 'asked to quit'); }
        },

        tray: !tray ? undefined : {
            add: function (options) { return tray.add(options); },
            labels: function () { return tray.labels(); }
        }
    };

    var bundlePath = path.join(serverConfig.output.path, serverConfig.output.filename);
    var loaded = null;

    async function load() {
        if (loaded) {
            await loaded.destroy();//rectify runs each plugin's onDestroy, backwards
            loaded = null;
        }

        host.router = http.swapRouter();

        delete require.cache[require.resolve(bundlePath)];
        loaded = await require(bundlePath)(host);
    }

    //one reload at a time. watch() fires again while a load is still awaiting,
    //and two overlapping loads are the double registration all of this exists
    //to prevent.
    var queue = Promise.resolve();

    var first = null;
    var ready = new Promise(function (resolve, reject) { first = { resolve, reject }; });

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
                //the old half is already torn down, so the app is serving the
                //window and nothing else. say so on screen, not just here.
                console.error('server half failed to reload', e && e.stack || e);
                io.emit('server:error', { message: String(e && e.stack || e) });
            });
        }, function () { /* the previous reload already reported itself */ });
    });

    await register(null, {
        build: {
            //src/main.js waits on this before it listens, so the handlers are
            //up before anything can connect
            ready: function () { return ready; }
        }
    });
}
module.exports = plugin;
