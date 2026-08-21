//devtools puts two items on the tray, and the point of this test is the build
//where it must not: compiling the node half into main.bin is undone by a menu
//item that opens a console onto it.
//
//only answerable here. Whether the items are on the tray is a fact about a real
//nw.Tray in a real process.

plugin.consumes = ['selftest', 'app', 'tray'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, tray } = imports;

    describe('devtools, in the running app', function () {

        it('offers a way in while developing', function () {
            if (app.isPackaged) return;

            var labels = tray.labels();
            assert.ok(labels.indexOf('Inspect window') >= 0, labels.join(', '));
            assert.ok(labels.indexOf('Inspect main.js') >= 0, labels.join(', '));
        });

        it('offers none at all once packaged', function () {
            if (!app.isPackaged) return;

            var labels = tray.labels();
            assert.ok(labels.indexOf('Inspect window') < 0, 'a packaged build offers a console: ' + labels.join(', '));
            assert.ok(labels.indexOf('Inspect main.js') < 0, labels.join(', '));
        });

        it('reaches the background page by the debugger, since nw cannot', function () {
            //main.js runs in a background page, which nw's own window api
            //cannot get a handle on. The only way in is chromium's debugger,
            //and tools/nw.js only opens that port for a source run.
            assert.equal(typeof tray.add, 'function');
        });
    });

    register();
}
module.exports = plugin;
