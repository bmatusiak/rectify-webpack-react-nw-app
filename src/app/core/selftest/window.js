var harness = require('@bmatusiak/rectify/harness.js');

//the window's side of it. Everything a window test needs is already here and
//cannot be anywhere else: a document, a stylesheet that has actually loaded,
//react having rendered, and the services the page really got.

plugin.consumes = ['io'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var io = imports.io;
    var mine = harness.create();

    function run(data, ack) {
        if (typeof ack != 'function') return;

        mine.run({ log: function () {} }).then(ack, function (err) {
            ack({ suites: [], passed: 0, failed: 1, error: (err && err.message) || String(err) });
        });
    }

    io.on('selftest:run', run);

    await register(null, {
        selftest: mine,
        onDestroy: function () { io.off('selftest:run', run); }
    });
}
module.exports = plugin;
