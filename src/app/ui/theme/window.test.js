
//THE TESTS THAT NEED A BROWSER.
//
//None of this can be answered outside a window. A stylesheet has to have
//loaded, the cascade has to have been resolved, and something has to have
//painted -- getComputedStyle is not a thing you can mock and learn anything
//from. So these run in the page, in the app, against the swatch it is wearing.
//
//which makes them the tests for the work that was previously only checkable by
//taking a screenshot and looking at it.

var React = require('react');

plugin.consumes = ['selftest', 'theme'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var theme = imports.theme;

    function read(name) {
        return getComputedStyle(document.body).getPropertyValue(name).trim();
    }

    //what a colour really is once the layers under it are painted in
    function contrast(el) {
        var fg = channels(getComputedStyle(el).color);
        var bg = ground(el);
        var a = luminance(fg), b = luminance(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    function ground(el) {
        var layers = [];
        for (var node = el; node; node = node.parentElement) {
            var c = channels(getComputedStyle(node).backgroundColor);
            if (!c || c[3] <= 0) continue;
            layers.push(c);
            if (c[3] >= 1) break;
        }
        if (!layers.length) layers.push([255, 255, 255, 1]);

        var out = layers[layers.length - 1];
        for (var i = layers.length - 2; i >= 0; i--) {
            var t = layers[i], al = t[3];
            out = [t[0] * al + out[0] * (1 - al), t[1] * al + out[1] * (1 - al), t[2] * al + out[2] * (1 - al), 1];
        }
        return out;
    }

    function channels(colour) {
        var text = String(colour);
        var parts = text.match(/[0-9.]+/g);
        if (!parts || parts.length < 3) return null;
        var scale = /^color\(/.test(text) ? 255 : 1;
        return [+parts[0] * scale, +parts[1] * scale, +parts[2] * scale, parts.length > 3 ? +parts[3] : 1];
    }

    function luminance(rgb) {
        var v = rgb.slice(0, 3).map(function (c) {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }

    describe('the theme, in a real window', function () {

        it('has a stylesheet that actually loaded', function () {
            //a link element proves nothing; a resolved custom property does
            assert.ok(read('--bs-body-bg'), 'no --bs-body-bg, so nothing applied');
            assert.ok(read('--bs-primary'), 'no --bs-primary');
        });

        it('offers every swatch in the folder, and default', function () {
            assert.ok(theme.swatches.length > 1, theme.swatches.length + ' swatches');
            assert.ok(theme.swatches.indexOf('default') >= 0, theme.swatches.join(', '));
        });

        //THE LINK GOES FIRST IN `head`, BEFORE ANYTHING style-loader PUT THERE
        //OR WILL PUT THERE -- and that ordering is the whole reason the kit's
        //own rules can correct a swatch.
        //
        //APPENDED, THE SWATCH COMES LAST and its
        //`.text-body-secondary { ... !important }` beats ours on source order
        //alone: same specificity, same importance, later wins. That is how the
        //active sidebar pill became unreadable on thirteen of the twenty-eight,
        //which `npm run drive -- --swatches` found and nothing here did.
        //
        //ITS OWN SABOTAGE SAID SO by surviving -- the insert was turned into an
        //append and every check passed.
        it('puts the swatch before the kit, not after it', function () {
            var link = document.getElementById('theme-swatch');
            assert.ok(link, 'there is no swatch link at all');

            //BEFORE THE KIT'S OWN RULES, WHICH IS THE ORDERING THAT MATTERS --
            //not before every style on the page.
            //
            //ASSERTING IT WAS LITERALLY FIRST WAS WRONG, and a full run said so:
            //../editor's ace injects `<style id="ace-tomorrow-night">` at the
            //top of head, so the link is second and nothing is broken. A test
            //that pins an invariant tighter than the invariant fails on a
            //neighbour doing something reasonable.
            var kit = [].slice.call(document.head.querySelectorAll('style'))
                .filter(function (el) { return /is-guarded|--bs-guarded/.test(el.textContent); })[0];

            assert.ok(kit, 'the kit own stylesheet is not in head, so the ordering proves nothing');

            //`DOCUMENT_POSITION_FOLLOWING` is 4: the kit comes AFTER the link,
            //which is what lets `.text-body-secondary { ... !important }` in the
            //kit correct a swatch that set the same thing.
            assert.ok(link.compareDocumentPosition(kit) & 4,
                'the swatch comes after the kit that corrects it, so it wins on source order alone');
        });

        //A NAME NOBODY SHIPS FALLS BACK TO `default`, rather than to a link with
        //nothing behind it: an href that 404s leaves the page wearing whatever
        //it had, silently, while `swatch` names something that is not on screen.
        it('refuses a swatch nobody ships, rather than wearing nothing', function () {
            var was = theme.swatch;

            try {
                var applied = theme.setSwatch('probe-no-such-swatch');

                assert.equal(applied, 'default', 'it claimed to apply ' + applied);
                assert.equal(theme.swatch, 'default', 'the name on record is ' + theme.swatch);

                assert.ok(String(document.getElementById('theme-swatch').href)
                    .indexOf('probe-no-such-swatch') < 0, 'the dead href was set anyway');
            } finally { theme.setSwatch(was); }
        });

        //`modeLocked` IS NOT CHECKED HERE, and that is a decision rather than
        //an omission.
        //
        //Proving it needs the window to WEAR a dark-only swatch and be asked
        //for light -- and this suite shares one live window with every other
        //test in it. Four of them measure colours, so a swatch changed halfway
        //through is a page they never asked for: the attempt failed the sidebar
        //contrast check at 1.51:1, twice, on a state no test had set up.
        //Restoring it is not a matter of putting the name back either, because
        //asking for a stylesheet does not remove the one already applied.
        //
        //IT IS COVERED WHERE IT COSTS NOTHING TO COVER. `npm run drive --
        //--swatches` wears all twenty-eight in turn, in a window of its own,
        //and measures each -- which is where the eight dark-only designs
        //actually get exercised. A unit test that fights the other tests for
        //the same window is a worse version of a check that already exists.

        it('paints the shell from the body colours, not bootstrap tertiary', function () {
            //the bug this was written for: bg-body-tertiary is only redefined
            //for dark by the dark swatches, so the sidebar stayed pale while
            //its text went pale with it.
            //
            //the LINKS, not the container. Measuring .app-sidebar itself passed
            //happily while every link in it was the colour of the ground --
            //the container's own text is not what anybody reads.
            var links = [].slice.call(document.querySelectorAll('.app-sidebar .nav-pills .nav-link'));
            assert.ok(links.length > 0, 'no sidebar links');

            links.forEach(function (link) {
                if (!link.getBoundingClientRect().width) return;
                assert.ok(contrast(link) >= 4.5,
                    link.textContent.trim() + ' at ' + contrast(link).toFixed(2) + ':1');
            });
        });

        it('keeps every page heading readable', function () {
            var headings = [].slice.call(document.querySelectorAll('main h1, main h2, main h4'));
            assert.ok(headings.length > 0, 'no headings on the page');

            headings.forEach(function (h) {
                if (!h.getBoundingClientRect().width) return;
                assert.ok(contrast(h) >= 4.5, h.textContent.slice(0, 24) + ' at ' + contrast(h).toFixed(2) + ':1');
            });
        });

        it('keeps muted text above the floor, including inside a card', function () {
            //a card header is bootstrap's one translucent surface, and the mix
            //that worked against the body failed against it
            var muted = [].slice.call(document.querySelectorAll('.card-header .text-body-secondary'));
            muted.forEach(function (el) {
                if (!el.getBoundingClientRect().width) return;
                assert.ok(contrast(el) >= 4.5, el.textContent.slice(0, 24) + ' at ' + contrast(el).toFixed(2) + ':1');
            });
        });

        it('says which mode is really on, not which was asked for', function () {
            var painted = luminance(ground(document.body)) < 0.18 ? 'dark' : 'light';
            assert.equal(document.body.getAttribute('data-bs-theme'), painted);
        });

        //THE NAMES ARE READ OFF THE SPRITE, AND THIS IS WHERE THAT IS WORTH
        //CHECKING. `theme.icons` comes from a regex over the svg source before
        //it is injected; the symbols in the document come from the browser
        //parsing that same source. Two counts from two readings of one file --
        //if they ever disagree, the regex is wrong, and a page that maps over
        //the list is drawing icons that resolve to nothing.
        it('knows every icon in the sprite, and no others', function () {
            var names = theme.icons;
            assert.ok(Array.isArray(names), 'icons is not an array');
            assert.ok(names.length > 1000, 'only ' + names.length + ' icons');

            var symbols = document.querySelectorAll('#bootstrap-icon-svg symbol[id]');
            assert.equal(names.length, symbols.length,
                names.length + ' names against ' + symbols.length + ' symbols in the document');

            //and they are the same names, not merely the same number of them
            var missing = [].slice.call(symbols).filter(function (symbol) {
                return names.indexOf(symbol.id) < 0;
            });
            assert.equal(missing.length, 0,
                'in the sprite and not in the list: ' + missing.slice(0, 5).map(function (s) { return s.id; }).join(', '));
        });

        //SORTED AND FROZEN, because a page renders it directly. A caller that
        //could sort it in place would be reordering what every other caller is
        //about to draw.
        it('hands the list out sorted, and not the original', function () {
            var names = theme.icons;
            var sorted = names.slice().sort();

            assert.equal(names.join(','), sorted.join(','), 'the list is not sorted');
            assert.equal(Object.isFrozen(names), true, 'the list can be edited by whoever asks for it');
        });

        //A NAME IN THE LIST HAS TO BE A NAME <Icon> ANSWERS TO -- the whole
        //point of reading them off the sprite rather than listing them.
        it('draws one of the names it hands out', async function () {
            var name = theme.icons[Math.floor(theme.icons.length / 2)];
            var view = await mount(React.createElement(theme.ui.Icon, { name: name, size: '24' }));

            try {
                var use = view.find('svg.bi use');
                assert.ok(use, 'no <use> was rendered for ' + name);
                assert.equal(use.getAttribute('xlink:href') || use.getAttribute('href'), '#' + name);

                //and the sprite really has that symbol to point at
                assert.ok(document.getElementById(name), 'nothing in the document answers to #' + name);
            } finally {
                view.unmount();
            }
        });
    });

    register();
}
module.exports = plugin;
