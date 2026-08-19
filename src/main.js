process.env.NODE_ENV = process.env.NODE_ENV || 'development';

//nw.js runs this in its node context, `main` in package.json. no window is
//created; the plugins below open one.
//
//a plugin is a folder in src/app, and the files in it say where it runs:
//
//  main.js     here, the nw process. loaded off disk, never bundled, never
//              reloaded — it has to outlive what the reload replaces
//  server.js   the app's node half, bundled and reloaded on every save
//  window.js   the window
//
//so this list is every src/app/<plugin>/main.js there is. drop a folder in and
//it loads; rename it with a leading _ and it does not.

var fs = require('fs');
var path = require('path');
var rectify = require('@bmatusiak/rectify');

var pkg = require('../package.json');
var Config = require('./config');

var PLUGINS = path.join(__dirname, 'app');

function discover() {
    return fs.readdirSync(PLUGINS)
        .filter(function (name) { return name[0] != '_' && name[0] != '.'; })
        .map(function (name) { return path.join(PLUGINS, name, 'main.js'); })
        .filter(function (file) { return fs.existsSync(file); })
        .map(function (file) { return require(file); });
}

(async function boot() {

    var plugins = discover();
    plugins.config = Config();

    var app = rectify.build(plugins, {
        isNw: typeof nw != 'undefined',
        root: path.dirname(__dirname),
        argv: typeof nw != 'undefined' ? nw.App.argv : process.argv.slice(2),
        appPackage: {
            title: pkg.title || pkg.name,
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            author: pkg.author,
            license: pkg.license
        }
    });

    //rectify keeps its destructors private and runs them from here, so hand the
    //lifecycle plugin a way to reach them
    app.services.app.destroyAll = function () { return app.destroy(); };

    app.on('error', function (err) {
        console.error('[main] a plugin failed to start', err && err.stack || err);
    });

    app = await app.start();
    var services = app.services;

    //the startup order, in one readable place rather than hidden in whichever
    //plugin happens to depend on all the others
    await services.build.ready();
    var url = await services.http.listen();

    console.log('listening on ' + url);
    services.lifecycle.publish(url);

    if (services.window) {
        if (services.tray) services.tray.start();
        services.window.open();

        //nw.js is single instance: a second launch is handed to this one
        nw.App.on('open', function () { services.window.show(); });
    }

    services.app.emit('start');

})().catch(function (e) {
    console.error(e && e.stack || e);
    process.exit(1);
});
