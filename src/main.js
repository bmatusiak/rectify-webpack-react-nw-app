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

//DEVELOPMENT CAN ALWAYS SERVE, whatever the manifest says. The build-time
//switch exists so a SHIPPED binary can be built without the ability at all;
//taking it away from the source tree would only mean the thing you develop
//against is not the thing you ship. Whether it IS serving is still runtime,
//and still off by default.
global.BUILD_SERVABLE = true;

//AND WHETHER ANYTHING OUTSIDE MAY DRIVE IT. Absent from the manifest means yes
//here and no in a package -- the dev loop and the command line are how this app
//is worked on, and a shipped binary should reach only what it was listed for.
//
//IT IS READ FROM THE MANIFEST RATHER THAN HARDCODED `true` the way BUILD_SERVABLE
//above is, and the difference is deliberate. Serving is a thing development does
//MORE of; being driveable is a thing it does DIFFERENTLY -- so `"open": false`
//has to work here, or the closed stance can only be reached by a three-minute
//`npm run dist` and nobody will ever run it. See ./stance.js.
global.BUILD_OPEN = require('./stance').decided(false, require('../package.json'), process.env);

var rectify = require('@bmatusiak/rectify');
var fs = require('fs');
var path = require('path');

var boot = require('./boot');
var wanted = require('./target');
var pkg = require('../package.json');
var Config = require('./config');
var serve = require('./serve');
var profile = require('./profile');

//EVERY TREE, NOT ONE -- package.json says which, and ./roots.js reads it. A
//root that is not on disk is skipped
//rather than refused: the second tree is separable, so an app that deleted it
//should boot rather than explain itself.
var ROOTS = require('./roots').map(function (name) { return path.join(__dirname, name); })
    .filter(function (dir) { return fs.existsSync(dir); });

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

//`name` so the same walk can find this context's tests when they are asked
//for. It defaults to the plugin filename, which is every other caller.
function found(dir, left, out, name) {
    name = name || 'main.js';

    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        if (!entry.isDirectory() || !scanned(entry.name)) return;
        var here = path.join(dir, entry.name);
        //BOTH, NOT EITHER: a folder may be a plugin and a group at once.
        if (fs.existsSync(path.join(here, name)))
            out.push(path.join(here, name));
        if (left > 1) found(here, left - 1, out, name);
    });
    return out;
}

//NAMED BY WHERE THEY LIVE -- see ./target.js. Every setup function in this app
//is called `plugin`, so without this they all are, everywhere one is named.
var plugins = [];
ROOTS.forEach(function (root) {
    found(root, DEPTH, []).forEach(function (file) {
        //named relative to ITS OWN root, so `core/io/main.js` is still called
        //that and a plugin from the second tree is `mcp/main.js`
        plugins.push(wanted.stamp(require(file), path.relative(root, file)));
    });
});

//and the base class rectify ships as a plugin rather than as part of the
//container, so a plugin that wants an emitter, a "ready" it can act on, or
//teardown collected where it is created can say `consumes: ['Plugin']`. Adding
//it here is what makes it available; nothing is obliged to use it.
plugins.push(rectify.PluginBase);

//THE TEST PLUGINS, ALWAYS, IN DEVELOPMENT.
//
//Nothing outside nw can boot a plugin that wants nw.Window or a tray icon, so
//the running app runs them instead.
//
//Not behind a flag any more. Loading them is what lets the app that is already
//open be asked for any one of them at any time -- which is the whole workflow:
//leave it running, change something, run one test, look, change it again. A
//flag would mean restarting to change target, and restarting is the thing this
//avoids.
//
//they are inert until something asks. src/main.prod.js has no equivalent path,
//so a packaged build has no way to load them at all.
ROOTS.forEach(function (root) {
    found(root, DEPTH, [], 'main.test.js').forEach(function (file) {
        plugins.push(wanted.tag(require(file), path.relative(root, file)));
    });
});

plugins.config = Config();

boot(plugins, {
    isPackaged: false,
    root: path.dirname(__dirname),
    argv: nw.App.argv,
    //whether a browser may be a client of this app: package.json's
    //"app": { "serve": true }, or --serve / --no-serve on the command
    //line, which wins. The tray can flip it while the app is running.
    serve: serve(pkg, nw.App.argv),
    //WHICH SET OF DATA THIS RUN WORKS ON: null for the app's own, or a name
    //from "app": { "profile" } or --profile=x. ./app/core/dataDir roots
    //itself on it, and everything that keeps anything roots under that.
    profile: profile(pkg, nw.App.argv),
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
