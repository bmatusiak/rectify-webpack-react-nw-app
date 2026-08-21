//the fourth boot: plain node, no nw.js, no window.
//
//  src/main.js      nw's node context, off disk
//  src/main.prod.js the same, from the packaged bundle
//  src/server.js    the app's node half, bundled and reloadable
//  src/window.js    the browser
//  src/cli.js       here — a terminal talking to a running app
//
//it does not share src/boot.js, because that one's job is the app's startup
//order: build, listen, open a window. This one's is to run a command and stop.
//
//so this is every src/app/<plugin>/cli.js there is. a plugin that wants a
//command adds one; a plugin that only answers over ipc needs nothing here at
//all, since anything the table does not know is forwarded to the app.

var fs = require('fs');
var path = require('path');
var rectify = require('@bmatusiak/rectify');

var pkg = require('../package.json');
var Config = require('./config');

var PLUGINS = path.join(__dirname, 'app');

//A PLUGIN IS A FOLDER WITH A cli.js IN IT, one level down or two:
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
        if (fs.existsSync(path.join(here, 'cli.js')))
            out.push(path.join(here, 'cli.js'));
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

(async function cli() {

    var app = rectify.build(plugins, {
        isCli: true,
        root: path.dirname(__dirname),
        argv: process.argv.slice(2),
        appPackage: {
            title: pkg.title || pkg.name,
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            author: pkg.author,
            license: pkg.license
        }
    });

    app.on('error', function (err) {
        console.error('[cli] a plugin failed to start', err && err.message || err);
        process.exit(1);
    });

    app = await app.start();
    await app.services.cli.run(process.argv.slice(2));

})().catch(function (e) {
    console.error(e && e.message || e);
    process.exit(1);
});
