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
const PORT = process.env.PORT || 8080;

//nw.js runs this in its node context, `main` in package.json. no window is
//created, this file opens it. the window is a remote page, so it gets its own
//context with no node in it, and socket.io is how the two halves talk.
const app = express();
const server = http.createServer(app);
const io = new Server(server);

//merged into rectify's `app` service, so plugins reach it with consumes: ['app']
const host = {
    express,
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

//the node half of every plugin, built by the second entry. built once, so a
//change under src/ that touches a server half needs a restart, the window half
//hot reloads on its own.
function buildServerBundle() {
    return new Promise(function (resolve, reject) {
        webpack(serverConfig).run(function (err, stats) {
            if (err) return reject(err);
            if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
            console.log('server bundle built in ' + stats.endTime - stats.startTime + 'ms');
            resolve(path.join(serverConfig.output.path, serverConfig.output.filename));
        });
    });
}

(async function () {

    const bundle = await buildServerBundle();
    await require(bundle)(host);

    server.listen(PORT, HOST, function () {
        const url = 'http://' + HOST + ':' + PORT + '/';
        console.log('listening on ' + url);

        //plain node, ie `npm run dev`, there is no window to open
        if (typeof nw == 'undefined') return;

        nw.Window.open(url, {
            id: 'main',
            width: 1024,
            height: 768
        }, function (win) {
            if (process.versions['nw-flavor'].indexOf('sdk') >= 0)
                win.showDevTools();//the normal flavor opens an empty devtools window

            win.on('closed', function () {
                nw.App.quit();
            });
        });
    });
})().catch(function (e) {
    console.error(e && e.stack || e);
});
