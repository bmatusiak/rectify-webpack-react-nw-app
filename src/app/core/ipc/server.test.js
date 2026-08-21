var harness = require('@bmatusiak/rectify/harness.js');

//the server half of ipc is a wrapper around the listener main.js owns, and its
//whole job is bookkeeping: hand out a handle for everything registered, and
//give all of it back when this bundle is thrown away.
//
//that matters because this half is rebuilt on every save. A handler left
//behind is the previous build still answering, which looks like the app
//working until two of them answer at once.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { app, ipc } = imports;
    var control = app.host.ipc;

    describe('ipc, server side', function () {

        it('passes the address through rather than deriving its own', function () {
            assert.equal(ipc.address, control.address);
        });

        it('registers on the socket main.js owns', function () {
            var handle = ipc.handle('probe-registered', function () { return 'yes'; });
            assert.ok(control.commands().indexOf('probe-registered') >= 0, control.commands().join(', '));
            handle.remove();
        });

        it('takes a handler off again when asked', function () {
            var handle = ipc.handle('probe-removable', function () {});
            handle.remove();
            assert.ok(control.commands().indexOf('probe-removable') < 0, control.commands().join(', '));
        });

        it('survives being asked to remove the same handler twice', function () {
            //teardown runs in reverse and a plugin may also have removed by
            //hand. The second call should be a no-op, not a throw.
            var handle = ipc.handle('probe-twice', function () {});
            handle.remove();
            handle.remove();
            assert.ok(control.commands().indexOf('probe-twice') < 0, 'still there');
        });

        it('reports the commands the socket actually has', function () {
            var handle = ipc.handle('probe-listed', function () {});
            assert.ok(ipc.commands().indexOf('probe-listed') >= 0, ipc.commands().join(', '));
            handle.remove();
        });
    });

    register();
}
module.exports = plugin;
