var harness = require('@bmatusiak/rectify/harness.js');

//the tray icon belongs to main.js because it outlives this bundle. This half
//hands items to it and remembers what it handed, so a save does not leave a
//second copy of every menu entry behind -- which is what happened before the
//handles existed, and what the ledger in the boot watches for.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'tray'];
plugin.provides = [];
function plugin(imports, register) {
    var { app, tray } = imports;
    var control = app.host.tray;

    describe('tray, server side', function () {

        it('puts an item on the menu main.js owns', function () {
            var item = tray.add({ label: 'probe-added' });
            assert.ok(control.labels().indexOf('probe-added') >= 0, control.labels().join(', '));
            item.remove();
        });

        it('takes it off again when asked', function () {
            var item = tray.add({ label: 'probe-gone' });
            item.remove();
            assert.ok(control.labels().indexOf('probe-gone') < 0, control.labels().join(', '));
        });

        it('survives being asked to remove the same item twice', function () {
            //teardown runs in reverse and a plugin may also have removed by
            //hand, so the second call has to be a no-op rather than a throw
            var item = tray.add({ label: 'probe-twice' });
            item.remove();
            item.remove();
            assert.ok(control.labels().indexOf('probe-twice') < 0, 'still there');
        });

        it('removes the right one when several are up', function () {
            var first = tray.add({ label: 'probe-one' });
            var second = tray.add({ label: 'probe-two' });

            first.remove();

            assert.ok(control.labels().indexOf('probe-one') < 0, 'the wrong one survived');
            assert.ok(control.labels().indexOf('probe-two') >= 0, 'the wrong one was taken');

            second.remove();
        });

        it('reports the labels the tray actually has', function () {
            var item = tray.add({ label: 'probe-listed' });
            //the harness has ok/equal/notEqual and no deepEqual, so compare
            //them as one string rather than reaching for node's assert here --
            //these run inside the app, which may not be node at all
            assert.equal(tray.labels().join('|'), control.labels().join('|'));
            item.remove();
        });
    });

    register();
}
module.exports = plugin;
