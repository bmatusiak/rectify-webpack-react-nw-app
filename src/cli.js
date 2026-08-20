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

var plugins = fs.readdirSync(PLUGINS)
    .filter(function (name) { return name[0] != '_' && name[0] != '.'; })
    .map(function (name) { return path.join(PLUGINS, name, 'cli.js'); })
    .filter(function (file) { return fs.existsSync(file); })
    .map(function (file) { return require(file); });

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
