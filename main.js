process.env.NODE_ENV = process.env.NODE_ENV || 'development';

//nw.js runs this in its node context, `main` in package.json. no window is
//created; the plugins below open one.
//
//two plugin lists, deliberately:
//
//  src/main/plugins.js   this process — server, window, tray, the bundler.
//                        loaded straight off disk, never bundled, never
//                        reloaded: it has to outlive what the reload replaces.
//  src/plugins.js        the app — the same list run twice, once here through
//                        src/server.js and once in the window through
//                        src/index.js. src/main/bundler rebuilds and reloads
//                        the node half of it on every save.

var path = require('path');
var rectify = require('@bmatusiak/rectify');

var pkg = require('./package.json');
var Config = require('./src/config');

var app_config = require('./src/main/plugins');
app_config.config = Config();

(async function boot() {

    var app = rectify.build(app_config, {
        isNw: typeof nw != 'undefined',
        root: __dirname,
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

    //rectify keeps its destructors private and runs them from here, so hand
    //the lifecycle plugin a way to reach them
    app.services.app.destroyAll = function () { return app.destroy(); };

    app.on('error', function (err) {
        console.error('[main] a plugin failed to start', err && err.stack || err);
    });

    app = await app.start();
    app.services.app.emit('start');

})().catch(function (e) {
    console.error(e && e.stack || e);
    process.exit(1);
});
