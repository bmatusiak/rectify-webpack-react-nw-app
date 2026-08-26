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

//`window` IS NOT IN THIS LIST, and cannot be: ../window consumes this one to
//quit, so asking it back is a cycle -- rectify said so by resolving fourteen
//services and stopping. What that field wanted is answered by ../bridge, which
//knows whether nw handed main a window, and knows it without the page being
//alive.
plugin.consumes = ['app', 'log', 'ipc', 'bridge'];
plugin.provides = ['lifecycle'];
async function plugin(imports, register) {
    var app = imports.app;
    var ipc = imports.ipc;

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

    //---- IS THIS APP UP, AND WHICH APP IS IT -----------------------------
    //
    //ANSWERED BY MAIN, WHICH IS THE WHOLE VALUE. Every other way to ask the app
    //about itself goes through a half that is gone in exactly the cases worth
    //asking about: `hello` is answered by src/app/demo/server.js, and `read` by
    //src/app/remote -- one in the node half, one in the window. Sabotage either
    //and `npm run drive` dies on `unknown command: hello` or `no answer to
    //"read"`, from a line that looks like it is about the DOM.
    //
    //main is loaded once, off disk, and never reloads. It answers when the node
    //half failed to load and when every window plugin threw.
    //
    //IT ALSO CARRIES `packaged`, and that is not padding. tools/drive.js needs
    //it to refuse driving a source tree when it was asked for a package -- and
    //it was getting it from the DEMO, which the scaffold promises is one folder
    //you can delete. A core tool depending on the example app is the kind of
    //coupling nothing goes red about.
    var health = ipc.handle('health', function () {
        var trouble = imports.bridge.trouble;

        return {
            //what it is
            title: app.appPackage && app.appPackage.title,
            name: app.appPackage && app.appPackage.name,
            version: app.appPackage && app.appPackage.version,
            packaged: !!app.isPackaged,
            pid: process.pid,

            //and how it is
            window: {
                //ATTACHED, NOT OPEN -- see ../bridge. A window whose plugins all
                //threw is attached and has no socket, and that pair is most of a
                //diagnosis on its own.
                attached: !!imports.bridge.attached,
                connected: !!imports.bridge.connected,

                //THE TEXT, NOT A BOOLEAN. "Something failed" sends somebody
                //looking; the first line of the message usually ends the search.
                trouble: trouble || null
            },

            //ONE WORD FOR THE ANSWER EVERYONE ACTUALLY WANTS. A caller that has
            //to work this out from three fields will work it out differently in
            //each place that asks.
            ok: !trouble
        };
    });

    await register(null, {
        lifecycle: lifecycle,
        onDestroy: function () {
            health.remove();
            try { fs.unlinkSync(INSTANCE_FILE); } catch (e) { /* never written, or already gone */ }
        }
    });
}
module.exports = plugin;
