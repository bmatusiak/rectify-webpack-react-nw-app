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
    'dataDir', 'state', 'secret', 'log', 'cron', 'events', 'cached', 'may'];
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
            dataDir: {
                path: imports.dataDir.path,
                from: imports.dataDir.from,
                profile: imports.dataDir.profile,
                root: imports.dataDir.root,
                profiles: imports.dataDir.profiles()
            },

            state: {
                where: imports.state.where,
                names: kept,

                //THE SECOND DRAWER, WHICH THE DEMO ITSELF OPENS AND CLOSES.
                //Nothing else in this scaffold calls `state.follow`, so what is
                //open here is whatever the Plumbing page last asked for.
                here: {
                    open: imports.state.here.open,
                    name: imports.state.here.name,
                    where: imports.state.here.where,
                    names: imports.state.here.names()
                }
            },
            secret: { where: imports.secret.where, can: imports.secret.can, names: secrets },
            cron: { beat: imports.cron.BEAT, jobs: imports.cron.list() },

            //WHAT CORE IS CARRYING WITHOUT KNOWING WHAT IT IS. Empty is the
            //honest answer in this scaffold, and showing it empty is the point:
            //the container exists so an app plugin never has to edit core.
            handedOver: imports.app.host.handedOver ? imports.app.host.handedOver() : [],

            log: { tags: imports.log.tags(), kept: imports.log.all().length },

            //THE DURABLE HALF. `kept` is the word that matters: this half's own
            //events plugin answers false when there is no main behind it, and
            //an empty record and one nothing is writing are opposite answers.
            events: {
                kept: imports.events.kept,
                where: imports.events.where,
                keeping: imports.events.policy.keep,
                never: imports.events.policy.never,
                rows: imports.events.all({ limit: 12 })
            }
        };
    }

    //A CAPABILITY OF THE DEMO'S OWN, which is the point of declaring it here
    //rather than in core: an app names what IT thinks is somebody's decision.
    //Core has `serve` and `markup` because core owns those; a credential field
    //belongs to whatever app has one.
    var undeclare = imports.may.declare('demo:password', {
        about: 'Fill in the demo password field. Nothing is done with what you type.'
    });

    //---- the demo is the app, so the demo is what knows where it is --------
    //
    //`state` NEVER LEARNS WHAT A NAMESPACE IS. It takes a function that answers
    //"which one now", and this is that function -- see ../core/state. A real app
    //would answer from whatever it calls a workspace; the demo answers from a
    //variable two buttons set, which is the same shape and fits on a page.
    //
    //ONE SLOT FOR THE WHOLE APP, so claiming it is a decision rather than a
    //detail: nothing else here follows, and a second plugin that did would take
    //this one's place.
    var working = null;
    var unfollow = imports.state.follow(function () { return working; });

    //named rather than inline, so teardown can remove this one and leave the
    //io plugin's own connection handler where it is
    function onConnection(socket) {
        socket.on('demo:info', function (data, ack) { if (ack) ack(info()); });
        socket.on('demo:services', function (data, ack) { if (ack) ack(services()); });
        socket.on('demo:graph', function (data, ack) { if (ack) ack(graph()); });
        socket.on('demo:log', function (data, ack) { if (ack) ack(log(data && data.count)); });

        //---- the plumbing page ----------------------------------------
        socket.on('demo:plumbing', function (data, ack) { if (ack) ack(plumbing()); });

        //THE THREE DOORS, SHOWN BY ASKING TWICE AND COUNTING. A cache is the
        //one kind of plumbing whose failure is invisible from outside -- it
        //answers either way -- so the only demonstration worth anything is one
        //that counts how often the expensive thing actually ran.
        socket.on('demo:cached', async function (data, ack) {
            if (!ack) return;

            var said = data || {};
            var ran = 0;

            function slow() { ran++; return { worked: 'out', at: new Date().toISOString() }; }

            try {
                if (said.ask) {
                    var door = said.door === 'whileFresh' ? 'whileFresh' : 'byContent';
                    var drawer = imports.cached[door]('demo-' + door);

                    //TWICE, IN ONE CALL. Two presses seconds apart would prove
                    //the same thing and would also be a window in which somebody
                    //could have changed something -- this way what is counted is
                    //only the cache.
                    await drawer.get(String(said.key || 'a-sha'), slow);
                    await drawer.get(String(said.key || 'a-sha'), slow);
                }

                if (said.stale) imports.cached.stale();
                if (said.forget) imports.cached.forgetEverything();
            } catch (e) {
                return ack({ failed: (e && e.message) || String(e) });
            }

            var stats = imports.cached.stats();

            ack({
                ran: ran,
                persists: imports.cached.persists,
                where: imports.cached.where,
                hit: stats.hit, miss: stats.miss, share: stats.share, wiped: stats.wiped,
                drawers: stats.drawers
            });
        });

        //TWO DRAWERS, SHOWN BY WRITING THE SAME DOCUMENT NAME INTO BOTH. The
        //page puts a note in whichever namespace is open and another in the
        //app's own, and neither answers the other -- which is the whole of what
        //`here` is for, and is easier to believe on screen than in a README.
        socket.on('demo:namespace', function (data, ack) {
            if (!ack) return;

            var said = data || {};

            //null CLOSES IT, and closing is a real state rather than a missing
            //one: with nothing open, `here` refuses instead of falling back.
            if (said.open !== undefined) working = said.open ? String(said.open) : null;

            var failed = null;

            try {
                if (said.note !== undefined) imports.state.here.doc('demo-here').write({ note: String(said.note) });
                if (said.forget) imports.state.here.doc('demo-here').forget();
            } catch (e) {
                //THE REFUSAL IS THE INTERESTING ANSWER, not an error to swallow:
                //writing with nowhere to put it is exactly what a person will
                //try first, and the sentence it comes back with is the lesson.
                failed = e.message;
            }

            var note = null;
            try { note = imports.state.here.doc('demo-here').read({ note: '' }).note; }
            catch (e) { /* nothing is open, which the page already knows */ }

            ack({
                open: imports.state.here.open,
                name: imports.state.here.name,
                where: imports.state.here.where,
                note: note,
                failed: failed,

                //the app's own, under the same document name, to stand beside it
                appNote: imports.state.doc('demo-here').read({ note: '' }).note
            });
        });

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
            //THE CLAIM ON `state.follow` GOES BACK, or a reloaded server half
            //leaves the old one still answering "which namespace" -- from a
            //closure over a variable nothing can reach any more.
            unfollow();
            working = null;

            //the declaration goes with the half that made it, so a reload does
            //not leave a capability declared by code that is no longer running
            undeclare();

            host.io.off('connection', onConnection);
            answered.remove();
            item.remove();
            while (added.length) added.pop().remove();
        }
    });
}
module.exports = plugin;
