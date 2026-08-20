//the middle of it: a command off the control socket, out over socket.io, into
//whichever view is the app.

plugin.consumes = ['io', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { io, ipc } = imports;

    //there can be more than one view. `open in browser` makes a second, and it
    //is a real client of the same server -- so a command has to choose, and say
    //which one it chose rather than leaving the caller to wonder.
    var views = [];
    var watched = new Set();

    //a view is a socket that said hello, not merely a socket. anything else on
    //this server -- the demo's own client, something a test opened -- would
    //never answer a click, and waiting five seconds to find that out is worse
    //than saying up front that nothing is there to drive.
    function watch(socket) {
        if (watched.has(socket)) return;
        watched.add(socket);

        socket.on('remote:hello', function (d) {
            var view = find(socket);
            if (!view) { view = { socket: socket }; views.push(view); }
            view.app = !!(d && d.app);
            view.title = (d && d.title) || null;
            view.href = (d && d.href) || null;
        });

        //and asks, rather than only listening. this half reloads on every save,
        //and a view that announced itself while it was down would otherwise
        //stay invisible until somebody reloaded the page by hand.
        socket.emit('remote:who');

        socket.on('disconnect', function () {
            watched.delete(socket);
            var i = views.indexOf(find(socket));
            if (i >= 0) views.splice(i, 1);
        });
    }

    function find(socket) {
        return views.filter(function (v) { return v.socket === socket; })[0];
    }

    io.on('connection', watch);
    //this half reloads on every save. the sockets that were already up do not
    //get a second `connection` for our benefit, so they are collected by hand.
    io.sockets.sockets.forEach(watch);

    //the nw window is what "the app" means. a browser view is a bystander, and
    //only gets the click if it is the only thing here.
    async function pick() {
        //the list is an optimisation, not the truth. this half reloads on every
        //save, and a hello sent while it was down went nowhere -- so when it
        //looks empty, ask rather than believe it.
        if (!views.length && io.sockets.sockets.size) {
            io.sockets.sockets.forEach(watch);
            io.emit('remote:who');
            await new Promise(function (r) { setTimeout(r, 400); });
        }

        if (!views.length) throw new Error(
            'no view is connected. is the window open, and has it finished loading?');

        var own = views.filter(function (v) { return v.app; });
        var from = own.length ? own : views;
        return from[from.length - 1];
    }

    function ask(verb) {
        //always a promise, never a throw. one handler that does both makes every
        //caller write two kinds of error handling for one kind of failure.
        return async function (data) {
            var view = await pick();

            return new Promise(function (resolve, reject) {
                var timer = setTimeout(function () {
                    reject(new Error('the view did not answer "' + verb + '" within 5s'));
                }, 5000);

                view.socket.emit('remote:' + verb, data, function (reply) {
                    clearTimeout(timer);
                    if (!reply) return reject(new Error('the view answered nothing'));
                    if (reply.error) return reject(new Error(reply.error));

                    reply.view = view.app ? 'window' : (view.title || 'browser');
                    if (views.length > 1) reply.views = views.length;
                    resolve(reply);
                });
            });
        };
    }

    var answered = [
        //what is out there to be driven, and what this half can see of it
        ipc.handle('views', async function () {
            io.sockets.sockets.forEach(watch);
            io.emit('remote:who');
            await new Promise(function (r) { setTimeout(r, 400); });

            return {
                connected: io.engine ? io.engine.clientsCount : 0,
                views: views.map(function (v) {
                    return { id: v.socket.id, app: v.app, title: v.title, href: v.href };
                })
            };
        }),

        ipc.handle('click', ask('click')),
        ipc.handle('fill', ask('fill')),
        ipc.handle('read', ask('read'))
    ];

    await register(null, {
        onDestroy: function () {
            while (answered.length) answered.pop().remove();
            io.off('connection', watch);
            views.length = 0;
            watched.clear();
        }
    });
}
module.exports = plugin;
