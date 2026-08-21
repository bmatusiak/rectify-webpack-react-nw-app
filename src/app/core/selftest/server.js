var harness = require('@bmatusiak/rectify/harness.js');

//the node half's side of it. Its own harness instance, not the module's shared
//one -- in development this context and `main` are the same process, and one
//instance between them meant each reported the other's results as its own.
//
//this is the half that CAN be booted outside the app, and used to be: a mock
//host stood in for nw and the tests ran in the test process. Running them here
//instead means they meet the real socket.io server, the real control socket and
//the real window, and there is no second host to keep in step with the first.

plugin.consumes = ['ipc'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var ipc = imports.ipc;
    var mine = harness.create();

    var answered = ipc.handle('selftest:server', async function () {
        return Object.assign({ context: 'server' }, await mine.run({ log: function () {} }));
    });

    await register(null, {
        selftest: mine,
        onDestroy: function () { answered.remove(); }
    });
}
module.exports = plugin;
