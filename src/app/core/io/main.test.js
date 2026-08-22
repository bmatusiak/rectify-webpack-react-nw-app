//socket.io, from the side that created it. In development it lives on the http
//server this app owns; in a packaged build there is no http server and what
//wears the same shape is the bridge. Both are checked by asking what is
//connected, which is the only thing anything downstream actually uses.

plugin.consumes = ['selftest', 'app', 'io', 'http'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, io } = imports;

    describe('io, from the process that made it', function () {

        it('exists and can be asked what is connected', function () {
            assert.ok(io, 'no io service');
            assert.ok(io.sockets && io.sockets.sockets, 'no socket map');
            assert.equal(typeof io.on, 'function');
        });

        //THE WINDOW CONNECTS ON ITS OWN SCHEDULE, WHICH IS NOT THIS ONE.
        //
        //This used to say the window had connected before any of it ran, and
        //that the app having got this far was itself the setup. Not so: a suite
        //asked for immediately after `npm start` can run while the page is still
        //opening its socket, and then this fails with "nothing is connected" on
        //a perfectly healthy app. Waiting for it is the difference between
        //testing the app and testing how fast the machine is.
        it('has the window on it', async function () {
            for (var i = 0; i < 80 && !io.engine.clientsCount; i++) {
                await new Promise(function (resolve) { setTimeout(resolve, 25); });
            }
            assert.ok(io.engine.clientsCount > 0, 'nothing connected within two seconds');
        });

        //WHAT IS ALWAYS TRUE ABOUT THE TWO COUNTERS, WHICH IS NOT EQUALITY.
        //
        //`engine.clientsCount` counts transports; `sockets.sockets` counts the
        //namespace's members. A member must have a transport, so one is never
        //greater than the other -- and that is a real invariant: a socket in the
        //namespace with no transport behind it would be a leak.
        //
        //THE REVERSE IS NOT A FAULT, and asserting it cost two red runs. A
        //client that has opened a transport and not yet joined is in one and not
        //the other, and a client that went away WITHOUT a clean close is counted
        //until socket.io's ping timeout reaps it -- up to about forty seconds.
        //
        //This first waited a second for them to converge, which was fine until
        //the suite itself started opening and closing browser views
        //(remote/server.test.js). Then "at rest" stopped being something a run
        //could assume, and the honest assertion is the one that does not need it.
        it('never has a socket in the namespace the engine does not know about', function () {
            var mine = io.sockets.sockets.size;
            var theirs = io.engine.clientsCount;

            assert.ok(mine <= theirs,
                mine + ' sockets in the namespace but only ' + theirs + ' transports');
        });

        it('is the bridge when packaged, and socket.io when not', function () {
            //the whole point of the shim: no plugin downstream can tell, and
            //this is the one place that is allowed to look
            if (app.isPackaged) assert.equal(typeof io.attach, 'undefined', 'that looks like socket.io');
            else assert.ok(io.engine, 'socket.io has an engine');
        });
    });

    register();
}
module.exports = plugin;
