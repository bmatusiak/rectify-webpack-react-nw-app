var suites = require('./suites');
var mount = require('./mount');

//THE ALTERNATIVE IS A FAKE DOCUMENT, and it answers the wrong question. jsdom
//will render a component and let a test read its markup, and it has no layout,
//no compositor and no stylesheet that has actually loaded -- so every question
//worth asking here comes back wrong or comes back "yes" for free: is the canvas
//sized to its box, did the swatch reach the gutter, is this text readable
//against what is behind it. This half runs where those have real answers.

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
