var fs = require('fs');
var path = require('path');

//ONE WAY OUT, AND EVERYTHING TAKES IT. `nw.App.quit()` is right there and is
//what a plugin would reach for, and it leaves the tray icon, the http server,
//socket.io and webpack's watchers open -- so the process stays alive with
//nothing on screen. Everything that ends the app comes through shutdown()
//instead: plugins are destroyed in reverse, THEN nw is asked to go, and a
//300ms unref'd timer exits by hand for the handles that outlive even that.
//
//The window closing and the node half failing to start both land here, which is
//why the first line of it is a re-entry guard rather than an assertion.

plugin.consumes = ['app', 'log'];
plugin.provides = ['lifecycle'];
async function plugin(imports, register) {
    var app = imports.app;

    //tools/nw.js reads this to say "already running" instead of starting a
    //second one. nw.js is single instance so the second launch is handed to us,
    //but that happens inside the nw binary where the launcher cannot see it.
    var INSTANCE_FILE = path.join(app.root, '.nw-instance.json');

    var shuttingDown = false;

    var lifecycle = {
        get isShuttingDown() { return shuttingDown; },

        //the window is not the app, so this is the only way out
        shutdown: function (reason) {
            if (shuttingDown) return;//the window closing and a failing server both land here
            shuttingDown = true;

            //SAID TO THE LOG AND NOT ONLY TO THE CONSOLE, because starting and
            //stopping are the two acts a record of "what happened while I was
            //away" is useless without -- and until this line they reached
            //nw.log and nothing else. See ../events, which keeps `app`.
            imports.log.on('app').info('shutting down: ' + reason);

            //every plugin's onDestroy, in reverse: the tray comes off, the
            //server closes, this file goes away
            Promise.resolve(app.destroyAll()).catch(function (e) {
                console.error('teardown failed', e && e.stack || e);
            }).then(function () {
                try { nw.App.closeAllWindows(); } catch (e) { /* already gone */ }
                try { nw.App.quit(); } catch (e) { /* already gone */ }
                //nw.App.quit() on its own can leave this context alive: the
                //server, socket.io and webpack's watchers are open handles
                var t = setTimeout(function () { process.exit(0); }, 300);
                if (t && t.unref) t.unref();
            });
        },

        publish: function (url) {
            //THE APP IS UP, AND THIS IS THE MOMENT TO SAY SO: http is listening
            //and every plugin has registered. Said before the packaged check
            //below, because a packaged app starting is exactly as worth
            //recording as a development one -- more so, since nobody is watching
            //a terminal.
            imports.log.on('app').good('started' + (url ? ', listening on ' + url : ''));

            //a package has no launcher reading this
            if (app.isPackaged) return;
            try {
                fs.writeFileSync(INSTANCE_FILE, JSON.stringify({ pid: process.pid, url: url }, null, 2));
            } catch (e) {
                console.error('could not write ' + INSTANCE_FILE + ': ' + (e && e.message));
            }
        }
    };

    //in nw's node context an uncaught throw takes the app down with no window
    //and no message, which is the failure mode hardest to read from outside
    process.on('uncaughtException', function (e) {
        console.error('uncaught exception', e && e.stack || e);
        lifecycle.shutdown('an uncaught exception');
    });
    process.on('unhandledRejection', function (e) {
        //not fatal on its own, but silence here is what hides a broken plugin
        console.error('unhandled rejection', e && e.stack || e);
    });

    await register(null, {
        lifecycle: lifecycle,
        onDestroy: function () {
            try { fs.unlinkSync(INSTANCE_FILE); } catch (e) { /* never written, or already gone */ }
        }
    });
}
module.exports = plugin;
