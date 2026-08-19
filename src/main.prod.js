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

var path = require('path');

var boot = require('./boot');
var pkg = require('../package.json');
var Config = require('./config');

//the same folder scan src/main.js does off disk, done by webpack at build time
var found = require.context('./app', true, /^\.\/[^_.][^/]*\/main\.js$/);
var plugins = found.keys().map(found);

plugins.config = Config();

//where the app's files are. app.html is one of them and it knows its own
//location, which holds whether this is a packaged build or build/app being
//previewed with the sdk runtime — process.execPath only holds for the first.
var root = (function () {
    try {
        return path.dirname(require('url').fileURLToPath(location.href));
    } catch (e) {
        return path.dirname(process.execPath);
    }
})();

boot(plugins, {
    isNw: true,
    isPackaged: true,
    root: root,
    argv: nw.App.argv,
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
