//the middle of it: a command off the control socket, out over socket.io, into
//whichever view is the app.

plugin.consumes = ['io', 'ipc', 'Plugin'];
plugin.provides = [];
async function plugin(imports, register) {
    var { io, ipc } = imports;

    //`own` collects the undo beside the thing being done. This half is rebuilt
    //on every save, and a listener left on the socket server outlives the
    //bundle that made it -- two of them answer the next command twice.
    var self = new imports.Plugin('remote');

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

            //THE TRANSPORT SETTLES IT WHEN IT CAN, AND THE PAGE ANSWERS WHEN IT
            //CANNOT.
            //
            //The page used to answer this alone, first from a ?view=app on its
            //url and later from whether main had injected `__host` into it.
            //Both are the page describing itself, and it got the answer wrong
            //after a reload: the window came back reporting `browser`, and a
            //`click` then went to whichever view was left rather than to the app.
            //
            //../core/bridge calls its one socket `window`, and only the nw window
            //is ever on it -- so arriving that way IS the proof, and it cannot go
            //stale or be claimed by a browser. Anything else is a socket.io
            //client, where the page's own word is all there is; a browser says
            //false because it has no bridge to find.
            //
            //THE FALLBACK IS ALSO WHAT MAKES THIS TESTABLE. test/server-graph
            //boots the real server half against real socket.io with no bridge
            //anywhere, so a harness there has no way to arrive as the window --
            //and a rule that only the bridge can answer would make the one test
            //that exercises this code outside nw unable to say what it means.
            view.app = socket.id === 'window' || !!(d && d.app);

            //WHICH VIEW THIS IS. The app's own window is always `window`; a
            //browser view carries whatever ../core/window named it when it
            //opened it. Anything else is a browser somebody opened by hand, and
            //socket.io's id is the only name it has -- shortened, because the
            //whole thing is twenty characters of nothing anybody can read.
            view.session = view.app ? 'window'
                : ((d && d.session) || ('browser-' + String(socket.id).slice(0, 6)));

            //the page is still the only one who knows these
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
    self.own(function () { io.off('connection', watch); });
    //this half reloads on every save. the sockets that were already up do not
    //get a second `connection` for our benefit, so they are collected by hand.
    io.sockets.sockets.forEach(watch);

    //the nw window is what "the app" means. a browser view is a bystander, and
    //only gets the click if it is the only thing here.
    async function pick(session) {
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

        //ASKED FOR ONE BY NAME. Without this a browser view can be opened and
        //looked at and never driven, because the app's own window always wins --
        //which is the right default and a useless one if it is the only rule.
        if (session) {
            var named = views.filter(function (v) { return v.session === session; })[0];
            if (named) return named;

            throw new Error('no view called "' + session + '". there is ' +
                views.map(function (v) { return v.session; }).join(', '));
        }

        var own = views.filter(function (v) { return v.app; });
        var from = own.length ? own : views;
        return from[from.length - 1];
    }

    function ask(verb) {
        //always a promise, never a throw. one handler that does both makes every
        //caller write two kinds of error handling for one kind of failure.
        return async function (data) {
            //`view` names one; without it the app's own window wins as before
            var view = await pick(data && data.view);

            return new Promise(function (resolve, reject) {
                var timer = setTimeout(function () {
                    reject(new Error('the view did not answer "' + verb + '" within 5s'));
                }, 5000);

                view.socket.emit('remote:' + verb, data, function (reply) {
                    clearTimeout(timer);
                    if (!reply) return reject(new Error('the view answered nothing'));
                    if (reply.error) return reject(new Error(reply.error));

                    //THE NAME IT CAN BE ASKED FOR AGAIN, not a description of
                    //it. This used to answer the page's title for a browser
                    //view, which reads well and is no use: two browser views of
                    //the same app have the same title, and neither can be aimed
                    //at by it.
                    reply.view = view.session;
                    if (views.length > 1) reply.views = views.length;
                    resolve(reply);
                });
            });
        };
    }

    function answer(name, fn) {
        var handle = ipc.handle(name, fn);
        self.own(function () { handle.remove(); });
    }

    //what is out there to be driven, and what this half can see of it
    answer('views', async function () {
        io.sockets.sockets.forEach(watch);
        io.emit('remote:who');
        await new Promise(function (r) { setTimeout(r, 400); });

        return {
            connected: io.engine ? io.engine.clientsCount : 0,
            views: views.map(function (v) {
                return { id: v.socket.id, session: v.session, app: v.app, title: v.title, href: v.href };
            })
        };
    });

    answer('click', ask('click'));
    answer('fill', ask('fill'));
    answer('read', ask('read'));

    self.own(function () {
        views.length = 0;
        watched.clear();
    });

    await register(null, { onDestroy: self.unload });
}
module.exports = plugin;
