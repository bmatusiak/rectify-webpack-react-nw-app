var fs = require('fs');
var path = require('path');

//EVERY BUTTON ON THE SYSTEM PAGE LANDS IN ONE OF THESE. The numbers are this
//process, not a fixture that renders the same and proves nothing: memory is
//read here, the tray items are added to the real tray, and "hide the window"
//hides the window somebody is looking at. A demo that cannot break is a demo
//that cannot tell you the app is broken.

//THE PLUMBING PAGE IS WHAT USES THE LAST FIVE, and it is the first thing in the
//scaffold that does. They live on the node side, so the page cannot reach them
//itself -- it asks over the socket, the same way the System page asks for a pid.
//
//`handover` IS NOT AMONG THEM, and that is its own point: it has no server half.
//What it carries arrives on the host as `of` and `handedOver`, which is exactly
//how an app plugin reaches its own main half without core naming it.
plugin.consumes = ['app', 'appPackage', 'tray', 'ipc', 'window',
    'dataDir', 'state', 'secret', 'log', 'cron'];;
plugin.provides = [];
async function plugin(imports, register) {
    var { app, appPackage, tray, ipc, window: win } = imports;
    var host = app.host;

    var started = Date.now();
    var added = [];//tray items this page put there

    function info() {
        return {
            pid: process.pid,
            uptime: (Date.now() - started) / 1000,
            memory: process.memoryUsage().rss,
            url: win.url,
            socket: ipc.address,
            packaged: !!host.isPackaged,
            tray: tray.labels()
        };
    }

    //what the Data page lists. reading the filesystem was the obvious thing and
    //the wrong one: this half is bundled, so __dirname is dist/, and a package
    //has no src/ to read anyway. the service graph is true in both.
    function services() {
        return Object.keys(app.services).sort().map(function (name) {
            var value = app.services[name];
            return {
                name: name,
                side: 'server',
                kind: typeof value === 'function' ? 'function' : value === undefined ? 'undefined' : 'object',
                keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 6).join(', ') : ''
            };
        });
    }

    //WHAT THE GRAPH PAGE DRAWS. rectify keeps the resolved dependency graph on
    //the app service -- frozen { name, provides, consumes } records, in load
    //order -- because only the container can know it. It is the same thing
    //rectify works out to sort the load, kept rather than discarded.
    //
    //THIS HALF'S, WHICH IS A DIFFERENT GRAPH FROM THE WINDOW'S. Same service
    //names on both sides, different plugins behind them, which is the thing the
    //picture makes obvious and a list does not.
    function graph() {
        return (app.plugins || []).map(function (entry) {
            return {
                name: entry.name,
                provides: entry.provides.concat(),
                consumes: entry.consumes.concat()
            };
        });
    }

    //WHAT THE TERMINAL PAGE READS. The launcher runs nw detached with its output
    //going to nw.log, so this file is the only account of what the app did --
    //and it is exactly the kind of thing a terminal is for and a <pre> is not.
    //
    //RAW, DELIBERATELY. tools/log.js unwraps and filters this for a person
    //reading it in a shell; here the point is the bytes as they were written.
    //Requiring that file would also drag tools/ into the server bundle, and
    //none of tools/ ships.
    function log(count) {
        var file = path.join(host.root || '.', 'nw.log');
        var text;
        try { text = fs.readFileSync(file, 'utf8'); }
        catch (e) {
            //A PACKAGED APP HAS NO LAUNCHER AND NO nw.log, and neither does one
            //whose log was cleared. Both are facts about how it was started
            //rather than failures, so they are said rather than thrown.
            return { file: file, missing: true, lines: [] };
        }
        var all = text.split(String.fromCharCode(10)).filter(function (one) { return one.trim(); });
        return { file: file, missing: false, total: all.length, lines: all.slice(-(count || 200)) };
    }

    //WHERE EVERYTHING THE NODE HALF KEEPS ACTUALLY LIVES, and what is in it.
    //The paths are the app's real ones, not a description of them -- this page
    //exists to be poked at, and a screenshot of invented paths would teach
    //somebody the wrong folder.
    function plumbing() {
        var kept = [];
        var secrets = [];

        try { kept = imports.state.names(); } catch (e) { /* nothing kept yet */ }
        try { secrets = imports.secret.names(); } catch (e) { /* nor sealed */ }

        return {
            dataDir: { path: imports.dataDir.path, from: imports.dataDir.from },
            state: { where: imports.state.where, names: kept },
            secret: { where: imports.secret.where, can: imports.secret.can, names: secrets },
            cron: { beat: imports.cron.BEAT, jobs: imports.cron.list() },

            //WHAT CORE IS CARRYING WITHOUT KNOWING WHAT IT IS. Empty is the
            //honest answer in this scaffold, and showing it empty is the point:
            //the container exists so an app plugin never has to edit core.
            handedOver: imports.app.host.handedOver ? imports.app.host.handedOver() : [],

            log: { tags: imports.log.tags(), kept: imports.log.all().length }
        };
    }

    //named rather than inline, so teardown can remove this one and leave the
    //io plugin's own connection handler where it is
    function onConnection(socket) {
        socket.on('demo:info', function (data, ack) { if (ack) ack(info()); });
        socket.on('demo:services', function (data, ack) { if (ack) ack(services()); });
        socket.on('demo:graph', function (data, ack) { if (ack) ack(graph()); });
        socket.on('demo:log', function (data, ack) { if (ack) ack(log(data && data.count)); });

        //---- the plumbing page ----------------------------------------
        socket.on('demo:plumbing', function (data, ack) { if (ack) ack(plumbing()); });

        socket.on('demo:kept', function (data, ack) {
            if (!ack) return;

            var doc = imports.state.doc('demo-notes');

            if (data && data.write !== undefined) doc.write({ note: String(data.write) });
            if (data && data.forget) doc.forget();

            ack({ note: doc.read({ note: '' }).note, path: doc.path });
        });

        socket.on('demo:sealed', function (data, ack) {
            if (!ack) return;

            try {
                if (data && data.forget) {
                    imports.secret.forget('demo');
                    return ack({ kept: false });
                }

                if (data && data.keep !== undefined) imports.secret.keep('demo', String(data.keep));

                var names = imports.secret.names();
                var kept = names.indexOf('demo') >= 0;

                //WHAT IS ON DISK, READ BACK AS BYTES. The whole claim of
                //core/secret is that this is not the value, so the page shows
                //it rather than asserting it.
                var onDisk = '';
                if (kept) {
                    onDisk = require('node:fs')
                        .readFileSync(imports.secret.where + require('node:path').sep + 'demo.sealed', 'utf8')
                        .slice(0, 60);
                }

                ack({
                    kept: kept,
                    can: imports.secret.can,
                    sealed: kept && imports.secret.sealed('demo'),
                    onDisk: onDisk,
                    value: kept ? imports.secret.read('demo', '') : ''
                });
            } catch (e) {
                ack({ error: (e && e.message) || String(e) });
            }
        });

        socket.on('demo:said', function (data, ack) {
            if (!ack) return;

            if (data && data.say) imports.log.on('demo', 'plumbing').info(String(data.say));
            ack({ lines: imports.log.since(Number((data && data.since) || 0)), tags: imports.log.tags() });
        });

        socket.on('demo:jobs', function (data, ack) {
            if (!ack) return;

            try {
                if (data && data.start) imports.cron.start(data.start);
                if (data && data.stop) imports.cron.stop(data.stop);
                if (data && data.fire) return imports.cron.fire(data.fire)
                    .then(function () { ack({ jobs: imports.cron.list() }); },
                        function () { ack({ jobs: imports.cron.list() }); });

                ack({ jobs: imports.cron.list() });
            } catch (e) {
                ack({ error: (e && e.message) || String(e) });
            }
        });

        socket.on('demo:hide', function (data, ack) { win.hide(); if (ack) ack({ ok: true }); });
        socket.on('demo:browser', function (data, ack) { win.openInBrowser(); if (ack) ack({ ok: true }); });

        socket.on('demo:tray-add', function (data, ack) {
            var n = added.length + 1;
            added.push(tray.add({
                label: 'Demo item ' + n,
                click: function () { console.log('demo tray item ' + n + ' clicked'); }
            }));
            if (ack) ack({ ok: true, count: added.length });
        });

        socket.on('demo:tray-clear', function (data, ack) {
            while (added.length) added.pop().remove();
            if (ack) ack({ ok: true });
        });
    }

    host.io.on('connection', onConnection);

    //an ordinary http route, on the router that gets swapped every reload
    host.router.get('/api/status', function (req, res) { res.json(info()); });

    //the same numbers, for `npm run cli -- hello`
    var answered = ipc.handle('hello', function () {
        return Object.assign({ hello: appPackage.title }, info());
    });

    //and one tray item of its own, so the menu has something from the app
    var item = tray.add({
        label: 'Open the demo',
        click: function () { win.show(); }
    });

    await register(null, {
        //this half is rebuilt on every save, so everything it put anywhere
        //comes back off first
        onDestroy: function () {
            host.io.off('connection', onConnection);
            answered.remove();
            item.remove();
            while (added.length) added.pop().remove();
        }
    });
}
module.exports = plugin;
