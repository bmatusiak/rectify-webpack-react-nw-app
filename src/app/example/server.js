//the node half of the example plugin. delete this folder and build your own.

plugin.consumes = ['app', 'appPackage', 'tray', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { app, appPackage, tray, ipc } = imports;

    //host.router, not the express app: the router is replaced on every reload,
    //so routes come and go with it rather than stacking up
    app.host.router.get('/api/hello', function (req, res) {
        res.json({ hello: appPackage.title, pid: process.pid, tray: tray ? tray.labels() : [] });
    });

    var item = tray.add({
        label: 'Say hello in the log',
        click: function () { console.log('hello from the tray, pid ' + process.pid); }
    });

    //what `npm run cli -- status` asks for
    var answered = ipc.handle('hello', function () {
        return { hello: appPackage.title, pid: process.pid, url: app.host.window && app.host.window.url };
    });

    await register(null, {
        //both come back off on reload, or the next build answers twice
        onDestroy: function () {
            item.remove();
            answered.remove();
        }
    });
}
module.exports = plugin;
