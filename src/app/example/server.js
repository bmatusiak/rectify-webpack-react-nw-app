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

    //tray is undefined under `npm run dev`, where there is no nw.js
    var item = tray && tray.add({
        label: 'Say hello in the log',
        click: function () { console.log('hello from the tray, pid ' + process.pid); }
    });

    //what `npm run cli -- status` asks for. ipc is undefined under
    //`npm run dev`, where there is no main half to hold the socket.
    var answered = !ipc ? null : ipc.handle('hello', function () {
        return { hello: appPackage.title, pid: process.pid, url: app.host.window && app.host.window.url };
    });

    await register(null, {
        //both come back off on reload, or the next build answers twice
        onDestroy: function () {
            if (item) item.remove();
            if (answered) answered.remove();
        }
    });
}
module.exports = plugin;
