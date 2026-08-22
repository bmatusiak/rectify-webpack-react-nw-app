//the packaged boot.
//
//note there is no `process.env.NODE_ENV = ...` here: webpack replaces that
//expression with the literal "production" in a production build, which would
//turn the assignment into "production" = "production" and fail to parse. webpack bundles this, nwjc compiles the bundle, and
//app.html loads the result — so nothing executable is on disk.
//
//it runs inside a hidden window rather than nw's node context, because
//evalNWBin is a Window method and the node context has no window to call it on.
//that window is local, so it has node; the visible one is remote and does not.

var rectify = require('@bmatusiak/rectify');
var path = require('path');

//this bundle runs inside a hidden window rather than nw's node context, and
//that context is missing a node global or two. socket.io reaches for this one
//under load, and an app that dies on its first busy moment is worse than one
//that never started.
if (typeof setImmediate === 'undefined') {
    global.setImmediate = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return setTimeout(function () { fn.apply(null, args); }, 0);
    };
    global.clearImmediate = function (t) { clearTimeout(t); };
}

var boot = require('./boot');
var pkg = require('../package.json');
var Config = require('./config');
var serve = require('./serve');

//the same folder scan src/main.js does off disk, done by webpack at build time
var found = require.context('./app', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/main\.js$/);
var plugins = found.keys().map(found);

//and the base class rectify ships as a plugin rather than as part of the
//container, so a plugin that wants an emitter, a "ready" it can act on, or
//teardown collected where it is created can say `consumes: ['Plugin']`. Adding
//it here is what makes it available; nothing is obliged to use it.
plugins.push(rectify.PluginBase);

plugins.config = Config();

//where the app's files are. nw sets the working directory to the app's own
//directory, whichever directory the app was launched from — measured both ways.
//
//the obvious alternatives are all wrong here: location.href is a
//chrome-extension:// url rather than a file:// one, so fileURLToPath throws;
//__dirname does not exist in this context at all; process.execPath is the
//runtime, which under `npm start -- --prod` is inside node_modules; and
//nw.App.startPath is wherever the launch happened to happen.
var root = process.cwd();

boot(plugins, {
    isPackaged: true,
    root: root,
    argv: nw.App.argv,
    //whether a browser may be a client of this app: package.json's
    //"app": { "serve": true }, or --serve / --no-serve on the command
    //line, which wins. The tray can flip it while the app is running.
    serve: serve(pkg, nw.App.argv),
    appPackage: {
        title: pkg.title || pkg.name,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        author: pkg.author,
        license: pkg.license
    }
}).catch(function (e) {
    console.error(e && e.stack || e);
});
