var fs = require('fs');
var path = require('path');

//EVERY BUTTON ON THE SYSTEM PAGE LANDS IN ONE OF THESE. The numbers are this
//process, not a fixture that renders the same and proves nothing: memory is
//read here, the tray items are added to the real tray, and "hide the window"
//hides the window somebody is looking at. A demo that cannot break is a demo
//that cannot tell you the app is broken.

plugin.consumes = ['app', 'appPackage', 'tray', 'ipc', 'window'];
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

    //named rather than inline, so teardown can remove this one and leave the
    //io plugin's own connection handler where it is
    function onConnection(socket) {
        socket.on('demo:info', function (data, ack) { if (ack) ack(info()); });
        socket.on('demo:services', function (data, ack) { if (ack) ack(services()); });
        socket.on('demo:graph', function (data, ack) { if (ack) ack(graph()); });
        socket.on('demo:log', function (data, ack) { if (ack) ack(log(data && data.count)); });

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
