var React = require('react');
var { useRef, useEffect } = React;

//THE TERMINAL, IN A REAL WINDOW.
//
//None of this can be answered outside one. xterm measures a character cell out
//of the DOM and lays every row out against it, so "did it lay out" is a question
//about a stylesheet having loaded and a box having been measured -- neither of
//which survives being mocked.

plugin.consumes = ['selftest', 'xterm'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var xterm = imports.xterm;

    //XTERM RENDERS ON ITS OWN SCHEDULE, so a frame or two is not a promise that
    //the bytes are on screen. Its write takes a completion callback and the
    //plugin passes it through; this is that, awaited, plus a paint so the
    //assertion reads a laid-out screen rather than a committed buffer.
    function wrote(handle, bytes, view) {
        return new Promise(function (resolve) { handle.write(bytes, resolve); })
            .then(function () { return view.painted(); });
    }

    //a component that hands the ref back out, so a test can drive the terminal
    //the way a page does
    function Harness({ take, height, look }) {
        var ref = useRef(null);
        useEffect(function () { take(ref.current); }, []);
        return React.createElement(xterm.Term, { ref: ref, look: look, height: height || 300 });
    }

    describe('the terminal, in a real window', function () {

        it('is a component and two palettes', function () {
            assert.equal(typeof xterm.Term, 'object');//forwardRef
            assert.equal(typeof xterm.look, 'function');
            assert.ok(xterm.LOOKS.dark, 'no dark palette');
            assert.ok(xterm.LOOKS.light, 'no light palette');

            assert.ok(xterm.look('dark').fontFamily, 'no font family');
            assert.ok(xterm.look('dark').scrollback > 0, 'no scrollback');

            //ANYTHING UNRECOGNISED IS DARK, because that is what this app was
            //before there was a choice, and a page that forgets to say should
            //not get a white rectangle.
            assert.equal(xterm.look('nonsense'), xterm.LOOKS.dark);
            assert.equal(xterm.look(), xterm.LOOKS.dark);

            //STABLE IDENTITY, because the component watches `look` to recolour a
            //live terminal -- a fresh object per call would recolour on every
            //render of the page.
            assert.equal(xterm.look('light'), xterm.look('light'));
        });

        //A LIGHT TERMINAL THAT ONLY FLIPS THE BACKGROUND IS UNREADABLE. xterm's
        //ansi defaults are picked for a black terminal, so a palette that does
        //not carry its own sixteen leaves the yellows and greens invisible and
        //the "bright black" a program uses for de-emphasis gone entirely.
        it('carries a full ansi palette on both sides', function () {
            var named = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

            ['dark', 'light'].forEach(function (which) {
                var palette = xterm.LOOKS[which].theme;
                assert.ok(palette.background, which + ' has no background');
                assert.ok(palette.foreground, which + ' has no foreground');

                named.forEach(function (name) {
                    assert.ok(palette[name], which + ' has no ' + name);
                    var bright = 'bright' + name.charAt(0).toUpperCase() + name.slice(1);
                    assert.ok(palette[bright], which + ' has no ' + bright);
                });
            });

            assert.notEqual(xterm.LOOKS.dark.theme.background, xterm.LOOKS.light.theme.background);
            assert.notEqual(xterm.LOOKS.dark.theme.foreground, xterm.LOOKS.light.theme.foreground);
        });

        it('reads its screen back through the terminal, not through the dom', async function () {
            var handle = null;
            var view = await mount(React.createElement(Harness, {
                take: function (h) { handle = h; }
            }));

            try {
                assert.equal(typeof handle.text, 'function');
                await wrote(handle, 'one line' + String.fromCharCode(13, 10), view);
                assert.ok(handle.text().indexOf('one line') >= 0, 'the buffer is empty');
            } finally {
                view.unmount();
            }
        });

        //THE ONE THAT WAS BROKEN, AND IT IS ASKED DIRECTLY.
        //
        //xterm.css matched the theme's swatch rule in webpack.config.js and was
        //emitted as a file called swatch-default.css rather than injected. The
        //terminal then had no stylesheet, so its rows stacked at the browser's
        //default line height and the cursor sat nowhere near the text. Nothing
        //threw; it just looked wrong.
        //
        //THE OBVIOUS ASSERTION DOES NOT WORK, AND THIS IS WHY THE RULE IS TO
        //SABOTAGE FIRST. `cols > 1` looks like proof that a cell was measured,
        //and it is not: xterm measures from the font in its own options, not
        //from the stylesheet, so cols and rows come out correct with no css at
        //all. Commenting the require out and re-running was the only way to find
        //that out — the suite stayed green.
        //
        //So it asks the document whether the stylesheet is there.
        it('has its stylesheet in the document', function () {
            var found = false;

            for (var i = 0; i < document.styleSheets.length && !found; i++) {
                var rules;
                //a stylesheet from another origin throws rather than answering
                try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
                if (!rules) continue;

                for (var r = 0; r < rules.length; r++) {
                    var selector = rules[r].selectorText;
                    if (selector && selector.indexOf('.xterm') >= 0) { found = true; break; }
                }
            }

            assert.ok(found, 'no .xterm rule in any stylesheet: xterm.css was not injected');
        });

        it('measures a cell and a box, and so has a size', async function () {
            var handle = null;
            var view = await mount(React.createElement(Harness, {
                take: function (h) { handle = h; }
            }));

            try {
                assert.ok(handle, 'the ref never arrived');
                assert.ok(view.find('.xterm'), 'xterm did not open into the element');

                var size = handle.size;
                assert.ok(size, 'the terminal reported no size');
                assert.ok(size.cols > 1, 'one column: the box was never measured (cols ' + size.cols + ')');
                assert.ok(size.rows > 1, 'one row: the box was never measured (rows ' + size.rows + ')');
            } finally {
                view.unmount();
            }
        });

        it('writes bytes, and reads escape sequences rather than printing them', async function () {
            var handle = null;
            var view = await mount(React.createElement(Harness, {
                take: function (h) { handle = h; }
            }));

            try {
                var ESC = String.fromCharCode(27);
                await wrote(handle, 'plain ' + ESC + '[32mgreen' + ESC + '[0m' + String.fromCharCode(13, 10), view);

                var text = handle.text();
                assert.ok(text.indexOf('plain') >= 0, 'the bytes never reached the screen');
                assert.ok(text.indexOf('green') >= 0, 'the coloured word is missing');

                //THE WHOLE ARGUMENT FOR THE PLUGIN, ASSERTED. A <pre> would show
                //the [32m; a terminal turns it into a colour and shows nothing.
                assert.ok(text.indexOf('[32m') < 0, 'the escape was printed as characters');
            } finally {
                view.unmount();
            }
        });

        //CLEARED RATHER THAN REBUILT, because rebuilding a terminal throws away
        //the scrollback somebody is reading.
        //
        //xterm's clear() KEEPS THE CURRENT LINE and makes it the new first one --
        //it is written for a prompt, where the line you are typing on should
        //survive. So the bytes have to end in a newline for the cursor to have
        //moved off them, or the assertion is about a line clear() never promised
        //to remove. Found by asserting the wrong thing first.
        it('clears without being rebuilt', async function () {
            var handle = null;
            var view = await mount(React.createElement(Harness, {
                take: function (h) { handle = h; }
            }));

            try {
                var CRLF = String.fromCharCode(13, 10);
                await wrote(handle, 'first' + CRLF + 'second' + CRLF, view);

                var before = handle.text({ all: true });
                assert.ok(before.indexOf('first') >= 0, 'nothing was written');
                assert.ok(before.indexOf('second') >= 0, 'the second line is missing');

                await new Promise(function (resolve) { handle.clear(resolve); });
                await view.painted();

                var after = handle.text({ all: true });
                assert.ok(after.indexOf('first') < 0, 'clear() left the old bytes');
                assert.ok(after.indexOf('second') < 0, 'clear() left the last line behind');

                //AND IT IS STILL THE SAME TERMINAL. A clear that worked by
                //rebuilding would pass everything above and lose the scrollback
                //this exists to protect, so the handle has to still be live.
                await wrote(handle, 'after' + CRLF, view);
                assert.ok(handle.text({ all: true }).indexOf('after') >= 0,
                    'the terminal stopped taking bytes, so it was rebuilt rather than cleared');
            } finally {
                view.unmount();
            }
        });

        //THE ONE THAT MATTERS ABOUT HAVING TWO PALETTES.
        //
        //Recolouring must not rebuild. Putting `look` in the dependency list of
        //the effect that CREATES the terminal would make this pass every visible
        //check and quietly throw away the scrollback somebody was reading every
        //time the page changed mode -- which is the same mistake the ref-instead
        //-of-a-text-prop shape exists to avoid.
        it('recolours a live terminal without throwing away what is in it', async function () {
            var handle = null;
            var view = await mount(React.createElement(Harness, {
                take: function (h) { handle = h; },
                look: xterm.look('dark')
            }));

            try {
                var CRLF = String.fromCharCode(13, 10);
                await wrote(handle, 'written while dark' + CRLF, view);
                assert.ok(handle.text({ all: true }).indexOf('written while dark') >= 0, 'nothing was written');

                view.render(React.createElement(Harness, {
                    take: function (h) { handle = h; },
                    look: xterm.look('light')
                }));
                for (var i = 0; i < 10; i++) await view.painted();

                assert.ok(handle.text({ all: true }).indexOf('written while dark') >= 0,
                    'changing the palette rebuilt the terminal and lost the scrollback');
            } finally {
                view.unmount();
            }
        });

        //DISPOSED, NOT LEFT. A page that mounted one of these per selection
        //would otherwise leak a terminal per click.
        it('takes its element with it when it goes', async function () {
            var view = await mount(React.createElement(Harness, { take: function () {} }));
            assert.ok(view.find('.xterm'), 'never mounted');

            view.unmount();
            assert.equal(view.find('.xterm'), null);
        });
    });

    register();
}
module.exports = plugin;
