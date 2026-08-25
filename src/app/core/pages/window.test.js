//THE REGISTRY, IN THE WINDOW THAT IS DRAWING IT.
//
//Every one of these registers against the real service, so every one of them
//takes its page back in a `finally` -- otherwise the app somebody is using ends
//the run with `probe-page` in its sidebar. Same rule ../../ui/banner's tests
//found the hard way: the service belongs to the app, not to the suite.

plugin.consumes = ['selftest', 'pages'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var pages = imports.pages;

    function Probe() { return null; }

    describe('the pages registry', function () {

        //THE DEMO'S PAGES ARE PART OF THE APP, so their presence is a fact about
        //the running app rather than something this suite sets up. If the demo
        //stops registering -- or goes back to rendering its own array -- this is
        //what says so.
        it('is holding the pages the app actually has', function () {
            var list = pages.list;

            assert.ok(list.length > 5, 'only ' + list.length + ' pages registered');
            assert.ok(list.filter(function (p) { return p.id === 'system'; })[0], 'no System page');

            list.forEach(function (one) {
                assert.equal(typeof one.id, 'string');
                assert.equal(typeof one.Page, 'function', one.id + ' has nothing to render');
            });
        });

        it('adds one and hands back the way to take it off again', function () {
            var added = pages.add({ id: 'probe-page', label: 'Probe', Page: Probe });

            try {
                assert.equal(added.id, 'probe-page');
                assert.ok(pages.list.filter(function (p) { return p.id === 'probe-page'; })[0]);
            } finally {
                added.remove();
            }

            assert.equal(pages.list.filter(function (p) { return p.id === 'probe-page'; }).length, 0,
                'it is still there after remove');
        });

        //AN id IS A KEY, NOT A LABEL. The window bundle is re-run on every save,
        //so a plugin that registers on load would stack a second copy each time
        //-- three copies of one page in the sidebar by lunchtime.
        it('replaces a page registered twice rather than stacking it', function () {
            var first = pages.add({ id: 'probe-page', label: 'One', Page: Probe });
            var second = pages.add({ id: 'probe-page', label: 'Two', Page: Probe });

            try {
                var found = pages.list.filter(function (p) { return p.id === 'probe-page'; });

                assert.equal(found.length, 1, 'there are ' + found.length + ' of it');
                assert.equal(found[0].label, 'Two', 'the first registration won');
            } finally {
                first.remove();
                second.remove();
            }
        });

        //ORDER IS A NUMBER, THEN ARRIVAL. Ties broken by anything else would be
        //broken by plugin load order, which falls out of the dependency graph --
        //so a page would move because something unrelated grew a `consumes`.
        it('orders by the number, and by arrival when they tie', function () {
            var late = pages.add({ id: 'probe-late', label: 'Late', order: 5000, Page: Probe });
            var later = pages.add({ id: 'probe-later', label: 'Later', order: 5000, Page: Probe });
            var first = pages.add({ id: 'probe-first', label: 'First', order: -1, Page: Probe });

            try {
                var ids = pages.list.map(function (p) { return p.id; });
                var mine = ids.filter(function (id) { return id.indexOf('probe-') === 0; });

                assert.equal(mine[0], 'probe-first', 'a low order did not come first');
                assert.equal(mine[1], 'probe-late');
                assert.equal(mine[2], 'probe-later', 'the tie was not broken by arrival');

                assert.equal(ids[0], 'probe-first', 'it did not sort ahead of the app pages');
            } finally {
                late.remove(); later.remove(); first.remove();
            }
        });

        //A PAGE THAT DOES NOT CARE LANDS AFTER THE ONES THAT DO, which is why
        //the default is 100 rather than 0. A plugin adding a page means "with
        //the others", not "at the front".
        it('puts a page with no order after the app own pages', function () {
            var added = pages.add({ id: 'probe-page', label: 'Probe', Page: Probe });

            try {
                var ids = pages.list.map(function (p) { return p.id; });
                assert.equal(ids[ids.length - 1], 'probe-page', 'it landed at ' + ids.indexOf('probe-page'));
            } finally {
                added.remove();
            }
        });

        it('refuses a page with no id and one with nothing to render', function () {
            var noId = null;
            try { pages.add({ label: 'x', Page: Probe }); } catch (e) { noId = e; }
            assert.ok(noId, 'a page with no id was accepted');

            var noPage = null;
            try { pages.add({ id: 'probe-page' }); } catch (e) { noPage = e; }
            assert.ok(noPage, 'a page with nothing to render was accepted');

            assert.equal(pages.list.filter(function (p) { return p.id === 'probe-page'; }).length, 0);
        });

        //THE SHELL HAS TO HEAR ABOUT IT, or a page registered after the window
        //drew itself would sit in the list and never appear -- which is exactly
        //what happens to a plugin that loads after the demo.
        it('tells whoever is drawing the list that it changed', function () {
            var heard = 0;
            var stop = pages.onChange(function () { heard++; });

            var added = pages.add({ id: 'probe-page', label: 'Probe', Page: Probe });
            assert.equal(heard, 1, 'nobody was told about the page');

            added.remove();
            assert.equal(heard, 2, 'nobody was told it went away');

            stop();
            var again = pages.add({ id: 'probe-page', label: 'Probe', Page: Probe });
            try {
                assert.equal(heard, 2, 'it kept talking after the listener let go');
            } finally {
                again.remove();
            }
        });
    });

    register();
}
module.exports = plugin;
