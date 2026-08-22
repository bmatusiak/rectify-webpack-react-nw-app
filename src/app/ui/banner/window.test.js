var React = require('react');

//THE BANNER, IN A REAL WINDOW.
//
//Most of this is about the list rather than the pixels -- what raises a banner
//is usually not what renders it -- but the last one needs a real page: the whole
//reason a banner is built out of the theme's Alert is that it inherits the
//pairing fix there, and only a laid-out document can say whether it did.

plugin.consumes = ['selftest', 'banner'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var banner = imports.banner;

    //what a colour is worth against what it is on
    function channels(colour) {
        var parts = String(colour).match(/[0-9.]+/g) || [];
        var scale = String(colour).indexOf('color(') === 0 ? 255 : 1;
        return parts.slice(0, 3).map(function (n) { return Number(n) * scale; });
    }

    function luminance(rgb) {
        var lin = rgb.map(function (c) {
            var v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    }

    function contrast(el) {
        var style = getComputedStyle(el);
        var a = luminance(channels(style.color));
        var b = luminance(channels(style.backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    //THE LIST IS THE RUNNING APP'S, NOT THIS SUITE'S.
    //
    //Three tests here were written as though nothing else could raise a banner,
    //and all three passed when this file was run on its own and failed in a full
    //run -- because by then the demo had something to say. Every count below is
    //relative to what was already up, and every cleanup takes back only what it
    //put there.
    function mine(view) {
        return view.all('.alert').filter(function (el) {
            return /raised (before the mount|after)|across the top|go away|something worth saying/.test(el.textContent);
        });
    }

    describe('the banner, in a real window', function () {

        it('hands out a component and a way to raise one from anywhere', function () {
            assert.equal(typeof banner.Banners, 'function');
            assert.equal(typeof banner.raise, 'function');
            assert.equal(typeof banner.lower, 'function');
            assert.equal(typeof banner.onChange, 'function');
            assert.equal(typeof banner.list, 'function');
        });

        it('raises one and gives back a name for it', function () {
            var id = banner.raise({ text: 'something is true' });
            try {
                assert.ok(id, 'no id came back');
                assert.ok(banner.list().some(function (b) { return b.id === id; }));
            } finally { banner.lower(id); }
        });

        //A PLUGIN WATCHING A STATE WILL SAY THE SAME THING EVERY TIME THAT STATE
        //MOVES, and three copies of "the node half failed to reload" are not
        //three times as true.
        it('replaces a banner of the same name rather than stacking one', function () {
            try {
                banner.raise({ id: 'once', text: 'first' });
                banner.raise({ id: 'once', text: 'second' });

                var mine = banner.list().filter(function (b) { return b.id === 'once'; });
                assert.equal(mine.length, 1, 'there are ' + mine.length + ' of them');
                assert.equal(mine[0].text, 'second', 'the second one did not take');
            } finally { banner.lower('once'); }
        });

        //`lower()` WITH NOTHING NAMED CLEARS THEM ALL -- INCLUDING THE APP'S.
        //
        //This service belongs to the running app, not to the suite. The demo
        //raises real banners on it, so a test that clears the list is a test
        //that turns off something the user was being told, and leaves it off
        //until whatever raised it happens to change again. So this one puts
        //back exactly what it took.
        it('lowers one by name, and all of them when told nothing', function () {
            var was = banner.list();

            try {
                banner.raise({ id: 'a', text: 'a' });
                banner.raise({ id: 'b', text: 'b' });

                banner.lower('a');
                assert.ok(!banner.list().some(function (b) { return b.id === 'a'; }), 'a is still up');
                assert.ok(banner.list().some(function (b) { return b.id === 'b'; }), 'b went too');

                banner.lower();
                assert.equal(banner.list().length, 0);
            } finally {
                banner.lower();
                was.forEach(function (b) { banner.raise(b); });
            }
        });

        //COUNTED, NOT COMPARED TO A LIST. Two things bit here. The harness has
        //`ok`, `equal` and `notEqual` and no `deepEqual` -- it runs inside the
        //app, where node's assert is not a given. And the service is the app's,
        //not this test's: the demo raises real banners of its own, so a test
        //that expects the list to be empty is a test that fails whenever the app
        //has something to say.
        it('tells whoever is watching, and stops when they stop', function () {
            var heard = 0;
            var sawIt = false;
            var stop = banner.onChange(function (list) {
                heard++;
                sawIt = list.some(function (b) { return b.id === 'watched'; });
            });

            try {
                banner.raise({ id: 'watched', text: 'x' });
                assert.equal(heard, 1, 'the watcher was not told');
                assert.ok(sawIt, 'it was told, but not about this one');

                banner.lower('watched');
                assert.equal(heard, 2);
                assert.ok(!sawIt, 'it is still in the list it was handed');

                stop();
                banner.raise({ id: 'after', text: 'y' });
                assert.equal(heard, 2, 'it kept talking after it was told to stop');
            } finally { stop(); banner.lower('watched'); banner.lower('after'); }
        });

        //the list is the service's: a banner raised before this mounted is
        //already there, and one raised after arrives without a re-render above
        it('shows what was already up, and what arrives later', async function () {
            banner.raise({ id: 'early', text: 'raised before the mount' });
            var view = await mount(React.createElement(banner.Banners));

            try {
                await view.until(function () { return mine(view).length === 1; },
                    'the one raised before the mount never appeared');

                banner.raise({ id: 'late', text: 'raised after' });
                await view.until(function () { return mine(view).length === 2; },
                    'the one raised after the mount never appeared');
            } finally {
                view.unmount();
                banner.lower('early');
                banner.lower('late');
            }
        });

        it('is nothing at all when there is nothing to say', async function () {
            //cleared and put back, for the same reason as above
            var was = banner.list();
            banner.lower();

            var view = await mount(React.createElement(banner.Banners));
            try {
                for (var i = 0; i < 5; i++) await view.painted();
                assert.equal(view.find('.alert'), null, 'it drew an empty bar');
            } finally {
                view.unmount();
                was.forEach(function (b) { banner.raise(b); });
            }
        });

        //A BANNER IS AN ALERT WITH ITS BOX MODEL FLATTENED. An alert is built to
        //sit in a column of content; a banner spans one edge to the other.
        it('is flattened, so it spans rather than sits in a column', async function () {
            banner.raise({ id: 'flat', text: 'across the top' });
            var view = await mount(React.createElement(banner.Banners));

            try {
                await view.until(function () { return mine(view).length === 1; }, 'nothing rendered');
                var el = mine(view)[0];

                assert.ok(el.className.indexOf('mb-0') >= 0, el.className);
                assert.ok(el.className.indexOf('rounded-0') >= 0, el.className);
            } finally { view.unmount(); banner.lower('flat'); }
        });

        //NOT bootstrap's data-bs-dismiss. That removes the element from the dom
        //and tells nobody, so the service would still be holding a banner that
        //is no longer on screen -- and would put it back on the next render.
        it('dismisses through the service, not out from under it', async function () {
            banner.raise({ id: 'closable', text: 'go away', dismissible: true });
            var view = await mount(React.createElement(banner.Banners));

            try {
                await view.until(function () { return mine(view).length === 1; }, 'it never rendered');
                mine(view)[0].querySelector('.btn-close').click();

                await view.until(function () { return mine(view).length === 0; },
                    'it is still on screen');
                assert.ok(!banner.list().some(function (b) { return b.id === 'closable'; }),
                    'the service still thinks it is up, so the next render puts it back');
            } finally { view.unmount(); banner.lower('closable'); }
        });

        //THE REASON IT IS BUILT OUT OF THE THEME'S ALERT. Several bootswatch
        //builds set an alert's text colour for one background and then paint a
        //different one; ../theme sets both ends together. A banner gets that for
        //nothing -- which is only true if it really is an alert.
        it('is readable, because it is an alert', async function () {
            banner.raise({ id: 'readable', variant: 'warning', text: 'something worth saying' });
            var view = await mount(React.createElement(banner.Banners));

            try {
                await view.until(function () { return mine(view).length === 1; }, 'nothing rendered');
                var ratio = contrast(mine(view)[0]);

                assert.ok(ratio >= 4.5, 'the banner measured ' + ratio.toFixed(2) + ':1');
            } finally { view.unmount(); banner.lower('readable'); }
        });
    });

    register();
}
module.exports = plugin;
