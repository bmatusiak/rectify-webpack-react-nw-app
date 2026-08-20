//the demo's node half. every button on the System page lands in one of these,
//so nothing on that page is a mock — the numbers are this process, and the
//window and tray it moves are the app's own.

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

    //named rather than inline, so teardown can remove this one and leave the
    //io plugin's own connection handler where it is
    function onConnection(socket) {
        socket.on('demo:info', function (data, ack) { if (ack) ack(info()); });
        socket.on('demo:services', function (data, ack) { if (ack) ack(services()); });

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
