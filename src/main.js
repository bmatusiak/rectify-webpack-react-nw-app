process.env.NODE_ENV = process.env.NODE_ENV || 'development';

//the development boot. nw.js runs this in its node context, `main` in
//package.json by way of the shim at the root.
//
//a plugin is a folder in src/app, and the files in it say where it runs:
//
//  main.js     here, the process around the app. off disk, never bundled
//  server.js   the app's node half, bundled and reloaded on every save
//  window.js   the window
//
//so this is every src/app/<plugin>/main.js there is, read off disk. the
//packaged build cannot do that — there is no src/ in it — so src/main.prod.js
//gets the same list from the bundle instead.

//webpack replaces this in the packaged bundle; here it just has to exist
global.BUILD_PROD = false;

var rectify = require('@bmatusiak/rectify');
var fs = require('fs');
var path = require('path');

var boot = require('./boot');
var pkg = require('../package.json');
var Config = require('./config');

var PLUGINS = path.join(__dirname, 'app');

//A PLUGIN IS A FOLDER WITH A main.js IN IT, one level down or two:
//src/app/remote, or src/app/core/http. The second level is the grouping, and it
//stops there -- ../ui/theme/swatch is somebody else's css, and the only thing
//between it and being started as a plugin is that nothing three levels down is
//ever looked at. A folder starting with _ or . is skipped, so a plugin can be
//parked without deleting it.
//
//THIS HAS TO ACCEPT EXACTLY WHAT THE require.context CALLS ACCEPT -- see
//src/window.js, src/server.js, src/main.prod.js. A plugin they take and this one
//misses runs in the packaged build and not in development, and neither says a
//word: an unfound plugin is not an error, it is an absence.
var DEPTH = 2;

function scanned(name) {
    return name[0] != '_' && name[0] != '.' && name != 'vendor';
}

function found(dir, left, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        var here = path.join(dir, entry.name);
        //BOTH, NOT EITHER: a folder may be a plugin and a group at once.
        if (fs.existsSync(path.join(here, 'main.js')))
            out.push(path.join(here, 'main.js'));
        if (left > 1) found(here, left - 1, out);
    });
    return out;
}

var plugins = found(PLUGINS, DEPTH, []).map(function (file) { return require(file); });

//and the base class rectify ships as a plugin rather than as part of the
//container, so a plugin that wants an emitter, a "ready" it can act on, or
//teardown collected where it is created can say `consumes: ['Plugin']`. Adding
//it here is what makes it available; nothing is obliged to use it.
plugins.push(rectify.PluginBase);

plugins.config = Config();

boot(plugins, {
    isPackaged: false,
    root: path.dirname(__dirname),
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
    process.exit(1);
});
