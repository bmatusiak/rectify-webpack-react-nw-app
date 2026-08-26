//BUILD_PROD is a constant webpack replaces, so only one of these branches is
//in the packaged bundle. it gates the requires directly rather than sitting
//inside a function, because webpack collects a dependency wherever it can
//reach it — a `require('webpack')` in an unreachable function is still bundled,
//and dragging webpack into a packaged app is exactly what this avoids.

plugin.consumes = ['app', 'http', 'io', 'window', 'tray', 'ipc', 'lifecycle', 'bridge', 'dataDir', 'log', 'handover', 'state', 'cron', 'secret'];
plugin.provides = ['build'];
async function plugin(imports, register) {
    var { app, http, io, window: win, tray, ipc, lifecycle, handover } = imports;

    //what the node half is handed. the window and the tray are passed as
    //controllers rather than objects, because they outlive the bundle.
    var host = {
        //which of the three builds this is, so the node half can say so
        isPackaged: !!app.isPackaged,
        root: app.root,

        express: http.express,
        router: http.router,
        httpServer: http.server,

        //THE BROWSER VIEWER, FORWARDED RATHER THAN HANDED OVER. The node half
        //may want to know whether anything outside this window can reach it, and
        //may want to change that -- the demo's System page offers it, and
        //io/server.test.js switches it on to open a real client and off again
        //afterwards. The server itself stays in main, like the window and the
        //tray, because it outlives this bundle.
        http: {
            get url() { return http.url; },
            get listening() { return http.listening; },
            get serving() { return http.serving; },
            setServing: function (on) { return http.setServing(on); }
        },
        io: io,
        appPackage: app.appPackage,

        //HANDED OVER WHOLE, not rebuilt. ../dataDir/main.js is the one place
        //that works out where this app keeps things, and its server half
        //refuses rather than guessing when there is no main behind it -- see
        //../dataDir/server.js. Naming it here is core-to-core, which is the
        //only kind of name this list is allowed to carry.
        dataDir: imports.dataDir,

        //THE LOG LIVES IN MAIN BECAUSE THIS HALF KEEPS RESTARTING. Handing it
        //over is what lets a server plugin write into the log that has been
        //kept since the app started, rather than one that empties on every
        //save -- see ../log/main.js.
        log: imports.log,
        state: imports.state,
        cron: imports.cron,
        secret: imports.secret,

        //EVERYTHING ELSE, WITHOUT THIS FILE LEARNING ITS NAME. The list above
        //is core naming core, which is fine -- but an app plugin with something
        //to keep across a reload must not have to add itself to it. Core would
        //learn that an app service exists, and the plugin would stop being
        //liftable. See ../handover/main.js: plugins put their own things in and
        //this carries the box without opening it.
        of: handover.get,
        handedOver: handover.names,

        window: {
            get url() { return http.url; },
            get isOpen() { return win.isOpen; },
            open: function () { win.show(); },
            show: function () { win.show(); },
            hide: function () { win.hide(); },
            openInBrowser: function () { if (http.url) nw.Shell.openExternal(http.url); },
            capture: function (options) { return win.capture(options); },

            //the browser views this app opened, which the node half can list,
            //open and close -- see ../window/main.js for why one of these is a
            //browser and the app's own window is not
            get views() { return win.views; },
            openView: function () { return win.openView(); },
            closeView: function (session) { return win.closeView(session); },
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

        //no separate bundle to load, and no reason to reload it
        ready = require('../../../server.js')(host);

        //AND THE ROUTES A BROWSER WOULD NEED, if anybody ever turns the viewer
        //on. This used to say "nothing to serve ... so a packaged build opens no
        //port at all", which was true when it was written and stopped being true
        //when serving became something a package can be asked for. It stopped
        //quietly: `serve on` opened a port, and every request to it answered 404
        //while the app's own window carried on working, because the window loads
        //view.html straight off disk and never asks the server for anything.
        //
        //Everything needed is already here. The window half is in memory --
        //../bridge carries it inside main.bin as a string, which is what keeps
        //javascript off disk -- and the stylesheets are files beside the app.
        //
        //MOUNTED ON THE ROUTER, so ../http's gate covers them: with the viewer
        //off these are not reachable, which is the whole point of the switch.
        //WRAPPED SO WEBPACK CAN DROP IT. BUILD_SERVABLE is a constant, so a
        //binary built with "canServe": false does not contain these routes at
        //all -- which is the difference between a switch that is off and an
        //ability that is not there.
        if (BUILD_SERVABLE) mountBrowserRoutes();

        function mountBrowserRoutes() {
        var path = require('path');
        var source = imports.bridge.source;

        //the page a browser gets. The window's own view.html has no script in it
        //-- it does not need one -- and a browser has no other way in.
        var SHELL = '<!doctype html><meta charset="utf-8">' +
            '<title>' + (app.appPackage.title || app.appPackage.name) + '</title>' +
            '<div id="root"></div>' +
            '<script src="window.js"></script>';

        http.router.get('/', function (req, res) { res.type('html').send(SHELL); });

        http.router.get('/window.js', function (req, res) {
            if (!source) return res.status(404).type('text').send('this build carries no window half');
            res.type('js').send(source);
        });

        //the swatches, which ARE on disk: tools/build.js leaves them beside the
        //binary rather than inside it, because 230kb each took main.bin from
        //4mb to 17mb. The page asks for them relatively, so this is where a
        //browser's `theme/swatch-x.css` lands.
        http.router.use('/theme', http.express.static(path.join(app.root, 'theme')));
        }

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
