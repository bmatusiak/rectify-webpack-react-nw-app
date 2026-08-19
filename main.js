process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const webpack = require('webpack');
const devMiddleware = require('webpack-dev-middleware');
const hotMiddleware = require('webpack-hot-middleware');
const pkg = require('./package.json');

const configs = require('./webpack.config.js')({}, { mode: process.env.NODE_ENV });
const clientConfig = configs.find((c) => c.name == 'client');
const serverConfig = configs.find((c) => c.name == 'server');

const HOST = process.env.HOST || 'localhost';
//0 means "whatever is free". nothing depends on a fixed port any more, so two
//of these can run side by side. set PORT to pin it.
const PORT = process.env.PORT || 0;

//nw.js runs this in its node context, `main` in package.json. no window is
//created, this file opens it. the window is a remote page, so it gets its own
//context with no node in it, and socket.io is how the two halves talk.
const app = express();
const server = http.createServer(app);
const io = new Server(server);

//plugins mount on a router rather than on the app, so the whole set of routes
//can be thrown away and rebuilt when the server bundle reloads
let router = express.Router();
app.use(function (req, res, next) { router(req, res, next); });

//merged into rectify's `app` service, so plugins reach it with consumes: ['app']
const host = {
    express,
    router,
    expressApp: app,
    httpServer: server,
    io,
    appPackage: {
        title: pkg.title || pkg.name,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        author: pkg.author,
        license: pkg.license
    }
};

const clientCompiler = webpack(clientConfig);
app.use(devMiddleware(clientCompiler, { publicPath: clientConfig.output.publicPath }));
app.use(hotMiddleware(clientCompiler));

//---- the node half of every plugin, built by the second entry --------------

const bundlePath = path.join(serverConfig.output.path, serverConfig.output.filename);
let serverApp = null;

async function loadServerBundle() {
    if (serverApp) {
        serverApp.destroy();//plugins tear down on app.on('destroy')
        serverApp = null;
    }

    //a fresh router, so routes from the previous load do not stack up
    router = express.Router();
    host.router = router;

    delete require.cache[require.resolve(bundlePath)];
    serverApp = await require(bundlePath)(host);
}

//watch rather than build once, so a change to a plugin's node half reloads
//the same way the window half does
function watchServerBundle(onBuild) {
    let first = true;
    webpack(serverConfig).watch({}, function (err, stats) {
        if (err) return first ? onBuild(err) : console.error(err);
        if (stats.hasErrors()) {
            const e = new Error(stats.toString({ all: false, errors: true }));
            return first ? onBuild(e) : console.error(String(e.message));
        }
        console.log('server bundle built in ' + (stats.endTime - stats.startTime) + 'ms');

        loadServerBundle().then(function () {
            if (first) { first = false; onBuild(null); }
            else console.log('server half reloaded');
        }, function (e) {
            if (first) { first = false; onBuild(e); }
            else console.error('server half failed to reload', e && e.stack || e);
        });
    });
}

//---- lifecycle -------------------------------------------------------------

let win = null;

//strict: the view is the app. when it goes, this process goes with it.
//nw.App.quit() on its own can leave the node context alive, because the
//server, socket.io and webpack's watchers are all still open handles.
function shutdown(reason) {
    console.log('shutting down: ' + reason);
    try { io.close(); } catch (e) { /* already gone */ }
    try { server.close(); } catch (e) { /* already gone */ }
    if (typeof nw != 'undefined') {
        try { nw.App.closeAllWindows(); } catch (e) { /* already gone */ }
        try { nw.App.quit(); } catch (e) { /* already gone */ }
    }
    var t = setTimeout(function () { process.exit(0); }, 300);
    if (t && t.unref) t.unref();//a browser timer id has no unref, see the readme
}

function openWindow(url) {
    nw.Window.open(url, {
        id: 'main',
        width: 1024,
        height: 768
    }, function (w) {
        if (!w) return shutdown('the window failed to open');
        win = w;

        if (process.versions['nw-flavor'].indexOf('sdk') >= 0)
            win.showDevTools();//the normal flavor opens an empty devtools window

        win.on('closed', function () {
            win = null;
            shutdown('the window was closed');
        });
    });
}

server.on('error', function (e) {
    if (e.code == 'EADDRINUSE')
        console.error('port ' + PORT + ' is already taken. another copy is probably still running.');
    else
        console.error(e.stack || e);
    shutdown('the server could not start');
});

watchServerBundle(function (err) {
    if (err) {
        console.error(err.stack || err);
        return shutdown('the server bundle would not build');
    }

    server.listen(PORT, HOST, function () {
        const url = 'http://' + HOST + ':' + server.address().port + '/';
        console.log('listening on ' + url);

        //plain node, ie `npm run dev`, there is no window to open
        if (typeof nw == 'undefined') return;

        openWindow(url);

        //nw.js is single instance: a second `npm start` wakes this one instead
        //of starting its own. bring the window back rather than doing nothing.
        nw.App.on('open', function () {
            if (win) { try { return win.show(), win.focus(); } catch (e) { win = null; } }
            openWindow(url);
        });
    });
});
