var suites = require('./suites');
var mount = require('./mount');

//the window's side of it. Everything a window test needs is already here and
//cannot be anywhere else: a document, a stylesheet that has actually loaded,
//react having rendered, and the services the page really got.

plugin.consumes = ['io'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var io = imports.io;
    var mine = suites();

    function run(data, ack) {
        if (typeof ack != 'function') return;

        mine.run(data).then(ack, function (err) {
            ack({ suites: [], passed: 0, failed: 1, error: (err && err.message) || String(err) });
        });
    }

    io.on('selftest:run', run);

    await register(null, {
        //THE HARNESS, PLUS THE ONE THING ONLY A WINDOW TEST NEEDS. A component
        //that measures its own box cannot be tested without being put in one,
        //and every surface under src/app/ui does exactly that. See ./mount.js.
        selftest: Object.assign({}, mine, { mount: mount }),
        onDestroy: function () { io.off('selftest:run', run); }
    });
}
module.exports = plugin;
