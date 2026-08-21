//the tray icon, from the process holding it. nw.Tray is not something a test
//process has -- there is no tray to put an icon on -- so this is the only place
//the question can be asked.
//
//it puts items on the real menu and takes them off again, which is safe: the
//menu is rebuilt whole on every change precisely so that adding and removing
//cannot leave it half right.

plugin.consumes = ['selftest', 'app', 'tray'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var tray = imports.tray;

    describe('the tray, in the running app', function () {

        it('exists, unless the desktop has nowhere to put it', function () {
            //`available` is false rather than an exception when nw could not
            //make one, because an app with no tray still has to run
            assert.equal(typeof tray.available, 'boolean');
        });

        it('already has what the other plugins put on it', function () {
            var labels = tray.labels();
            assert.ok(labels.length > 0, 'nothing on the menu at all');
            assert.ok(labels.indexOf('Open the demo') >= 0, labels.join(', '));
        });

        it('takes an item and gives it back', function () {
            var before = tray.labels().length;

            var item = tray.add({ label: 'probe-tray-item' });
            assert.ok(tray.labels().indexOf('probe-tray-item') >= 0, tray.labels().join(', '));

            item.remove();
            assert.ok(tray.labels().indexOf('probe-tray-item') < 0, 'still there');
            assert.equal(tray.labels().length, before, 'the menu did not come back to what it was');
        });

        it('removes the one it was asked for when several are up', function () {
            var first = tray.add({ label: 'probe-one' });
            var second = tray.add({ label: 'probe-two' });

            first.remove();

            assert.ok(tray.labels().indexOf('probe-one') < 0, 'the wrong one survived');
            assert.ok(tray.labels().indexOf('probe-two') >= 0, 'the wrong one was taken');

            second.remove();
        });

        it('survives being asked to remove the same item twice', function () {
            var item = tray.add({ label: 'probe-twice' });
            item.remove();
            item.remove();
            assert.ok(tray.labels().indexOf('probe-twice') < 0, 'still there');
        });
    });

    register();
}
module.exports = plugin;
