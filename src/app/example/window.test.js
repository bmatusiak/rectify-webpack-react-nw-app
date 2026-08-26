//THE BROWSER HALF OF THE EXAMPLE PLUGIN, TESTED IN THE PAGE IT DREW.
//
//PART OF THE TEMPLATE, like ./server.test.js -- one test file per context, or
//`test/plugin-scan.test.js` goes red for the one that has none.
//
//IT ASKS THE SERVICE, NOT THE DOM. Whether the page renders is answered once,
//for every page at once, by `demo/window.test.js` -- which opens each one and
//watches for a throw. What is worth asking HERE is what this plugin put into
//the app that nothing else would have: a page in the registry, and a node half
//that answers when the page calls it.

plugin.consumes = ['selftest', 'pages', 'io'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { pages, io } = imports;

    describe('the example plugin, in the window', function () {

        //A PAGE NOBODY LISTED. ../core/pages is what lets a plugin put its own
        //page in the sidebar, and this is the claim that would break silently:
        //the shell draws whatever is registered, so a page that never registers
        //is simply absent rather than broken.
        it('put its page in the sidebar without anything listing it', function () {
            var mine = pages.list.filter(function (p) { return p.id === 'example'; })[0];

            assert.ok(mine, 'no example page among ' +
                pages.list.map(function (p) { return p.id; }).join(', '));

            assert.ok(mine.label, 'a page with no label is a blank row in the sidebar');
            assert.equal(typeof mine.Page, 'function');
        });

        //THE ROUND TRIP THE PAGE ACTUALLY MAKES. A window cannot use `ipc`, so
        //it asks its own other half over the socket -- and the failure worth
        //catching is the quiet one: the page draws its fallback, looks fine, and
        //nothing ever answered.
        it('its other half answers over the socket', async function () {
            var out = await new Promise(function (resolve) {
                io.emit('example:hello', {}, resolve);
            });

            assert.ok(out, 'the node half said nothing at all');
            assert.ok(out.hello, 'it did not say which app it is');
            assert.equal(typeof out.pid, 'number');
            assert.ok(out.starts > 0, 'it does not know how many times it has started');
        });
    });

    register();
}
module.exports = plugin;
