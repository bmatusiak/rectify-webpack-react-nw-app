//THE NODE HALF OF THE EXAMPLE PLUGIN. Copy this folder, rename it, take the
//underscore off, and delete whatever you do not need.
//
//THE UNDERSCORE IS WHY THIS DOES NOT RUN. Every discovery site in the app skips
//a folder starting with `_` -- both disk walks and the one require.context -- so
//this is a template rather than a plugin, and taking the underscore off is the
//whole of "installing" it.
//
//WHAT IT IS FOR is showing what a plugin can reach for now that core carries a
//few things. Everything below is optional; a plugin that only answers one ipc
//command is a perfectly good plugin.

plugin.consumes = ['app', 'log', 'state', 'cron', 'ipc', 'io', 'Plugin'];
plugin.provides = [];
async function plugin(imports, register) {
    var { app, log, state, cron, ipc, io } = imports;

    //`Plugin` GIVES YOU own(), which is how a plugin cleans up after itself. This
    //half is rebuilt on every save, so anything registered here has to be
    //un-registered -- and collecting the undo where the thing is created is the
    //only way that survives somebody adding a fifth registration later.
    var self = new imports.Plugin('example');

    //---- saying something -------------------------------------------------
    //
    //A LOGGER WITH ITS TAGS ALREADY ON IT, so every line is filterable without
    //anybody having to remember to tag at the call site. See ../core/log.
    var say = log.on('example');
    say.info('the example plugin loaded, pid ' + process.pid);

    //---- keeping something ------------------------------------------------
    //
    //A WHOLE DOCUMENT, read and written at once, under the app's own directory.
    //This is the app's, not the person's -- what tab they were on belongs in
    //../core/webStorage instead. See ../core/state.
    var kept = state.doc('example');
    var seen = kept.read({ starts: 0 });

    kept.write({ starts: seen.starts + 1, last: new Date().toISOString() });
    say.info('this app has started ' + (seen.starts + 1) + ' times');

    //---- doing something on a timer ---------------------------------------
    //
    //`add` DESCRIBES IT AND `does` SUPPLIES THE WORK, because the description
    //survives a save and the work does not. `add` is safe to call again on every
    //reload; `does` is what has to be taken off and put back. See ../core/cron.
    cron.add({
        name: 'example-heartbeat',
        every: 60000,
        about: 'says it is still here, once a minute'
    });

    self.own(cron.does('example-heartbeat', function () {
        say.info('still here');
    }));

    //it is registered but not switched on -- `cron.start('example-heartbeat')`,
    //or start it from wherever a person asks for it
    self.own(function () { cron.forget('example-heartbeat'); });

    //---- answering the terminal -------------------------------------------
    //
    //`node src/cli.js example` reaches this. Anything the cli does not know by
    //name is forwarded to the app, so ./cli.js is only needed to give it a help
    //line and argument names.
    var handle = ipc.handle('example', function (data) {
        return {
            hello: app.host.appPackage.title,
            pid: process.pid,
            starts: kept.read({ starts: 0 }).starts,
            youSaid: (data && data.text) || null
        };
    });

    //`ipc.handle` hands back a handle with `.remove()`, and this half is rebuilt
    //on every save -- a handler left behind is a second copy answering the next
    //call
    self.own(function () { handle.remove(); });

    //---- answering the page -----------------------------------------------
    //
    //THE WINDOW CANNOT USE ipc -- that is main, server and cli -- so a page asks
    //its own other half over the socket, with an ack. See ../core/io.
    //
    //EVERY HANDLER PUT ON A SOCKET IS REMEMBERED AND TAKEN OFF AGAIN. Removing
    //the `connection` listener is not enough: io hands a late listener the
    //sockets that are already connected, so each reload would add another
    //handler and one emit would be answered several times over.
    var wired = new Map();

    function heard(socket) {
        if (wired.has(socket)) return;

        function hello(data, ack) {
            if (typeof ack != 'function') return;//nobody is waiting
            ack({ hello: app.host.appPackage.title, pid: process.pid, starts: kept.read({ starts: 0 }).starts });
        }

        socket.on('example:hello', hello);
        wired.set(socket, function () { socket.off('example:hello', hello); });
    }

    io.on('connection', heard);

    self.own(function () {
        io.off('connection', heard);
        wired.forEach(function (undo) { try { undo(); } catch (e) { /* gone */ } });
        wired.clear();
    });

    //---- and a route, if the browser viewer is on -------------------------
    //
    //`host.router`, NOT the express app: the router is replaced on every reload,
    //so routes come and go with it rather than stacking up.
    if (app.host.router) {
        app.host.router.get('/api/example', function (req, res) {
            res.json({ hello: app.host.appPackage.title, pid: process.pid });
        });
    }

    //A PLUGIN THAT PROVIDES NOTHING IS NORMAL -- it still declares `provides: []`
    //and still calls register(). `onDestroy` is what runs everything own() has
    //collected.
    await register(null, { onDestroy: self.unload });
}
module.exports = plugin;
