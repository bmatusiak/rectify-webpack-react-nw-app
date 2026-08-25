//A PAGE FROM THE SECOND TREE, IN THE SIDEBAR OF THE RUNNING APP.
//
//../../app/core/pages/window.test.js checks the registry with pages it makes up
//and takes back. This checks the claim the registry exists for: that a plugin
//in src/app_plugins, which nothing in src/app has heard of, ends up on screen
//beside the demo's own pages.
//
//NOTHING HERE REGISTERS OR REMOVES ANYTHING. The page under test is one the app
//is already showing, so the suite has nothing to clean up -- and it fails if
//./window.js stops registering, which is the point.

plugin.consumes = ['selftest', 'pages', 'tts'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var pages = imports.pages;
    var tts = imports.tts;

    function speech() {
        return pages.list.filter(function (one) { return one.id === 'speech'; })[0];
    }

    describe('the Speech page, added from app_plugins', function () {

        it('is in the list the shell draws', function () {
            var page = speech();

            assert.ok(page, 'the Speech page is not registered: ' +
                pages.list.map(function (p) { return p.id; }).join(', '));

            assert.equal(page.label, 'Speech');
            assert.equal(typeof page.Page, 'function');
        });

        //A PAGE THAT DOES NOT CARE LANDS AFTER THE ONES THAT DO. The demo
        //numbers its own; this one does not, so it goes last -- which is what
        //"add a page" should mean for a plugin that is not the app.
        it('sits after the app own pages rather than in among them', function () {
            var ids = pages.list.map(function (one) { return one.id; });

            assert.ok(ids.length > 5, 'only ' + ids.length + ' pages, so this proves little');
            assert.equal(ids[ids.length - 1], 'speech',
                'it is at ' + ids.indexOf('speech') + ' of ' + ids.length);
        });

        //AND IT IS ON SCREEN, not merely in a list. The registry could be
        //perfect and the shell could still be rendering its own array -- which
        //is exactly what it did before core/pages existed, and what this would
        //catch if anybody put it back.
        it('is drawn in the sidebar, not just registered', function () {
            var links = document.querySelectorAll('.app-sidebar a, .app-sidebar button');
            var labels = Array.prototype.map.call(links, function (el) {
                return (el.textContent || '').trim();
            });

            assert.ok(labels.length > 0, 'no sidebar on screen at all');
            assert.ok(labels.indexOf('Speech') >= 0,
                'the sidebar is showing: ' + labels.join(', '));
        });

        //THE SERVICE IT IS A PAGE FOR is the one from the other plugin in this
        //tree, resolved by the container rather than reached for -- so this also
        //says the two halves of the feature found each other.
        it('has the service it is a page for', async function () {
            assert.equal(typeof tts.speak, 'function');
            assert.ok(Array.isArray(await tts.voices()));
        });
    });

    register();
}
module.exports = plugin;
