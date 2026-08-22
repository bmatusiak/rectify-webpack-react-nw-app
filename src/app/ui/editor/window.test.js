var React = require('react');

//THE EDITOR, IN A REAL WINDOW.
//
//Ace measures its container to lay out and counts its own rows AFTER wrapping,
//so every question worth asking here -- did it render, did the mode file load,
//did the lid hold -- is a question about a real box in a real document.

plugin.consumes = ['selftest', 'editor'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var editor = imports.editor;

    //what ace calls a rendered line
    function lines(view) { return view.all('.ace_line'); }

    //every token class ace put on the screen. A mode that never loaded leaves
    //the text as one unstyled run, so the SET of classes is what says whether
    //anything was highlighted -- and comparing two sets says it without this
    //file having to know what ace calls a deleted line.
    function tokens(view) {
        var found = {};
        view.all('.ace_line span').forEach(function (span) {
            String(span.className).split(' ').forEach(function (one) {
                if (one.indexOf('ace_') === 0) found[one] = true;
            });
        });
        return Object.keys(found).sort();
    }

    describe('the editor, in a real window', function () {

        it('hands out the two components and the lid', function () {
            assert.equal(typeof editor.Code, 'function');
            assert.equal(typeof editor.Editor, 'function');
            assert.equal(typeof editor.LID, 'number');
            assert.ok(editor.LID > 100, 'the lid is too low to read a change whole');
        });

        it('renders the text it was given', async function () {
            var view = await mount(React.createElement(editor.Code, {
                text: 'var first = 1;\nvar second = 2;\nvar third = 3;'
            }));

            try {
                await view.until(function () { return view.find('.ace_editor'); }, 'ace never attached');
                await view.until(function () { return lines(view).length >= 3; },
                    'ace attached but never laid the rows out');
                assert.ok(lines(view).length >= 3, 'only ' + lines(view).length + ' rows laid out');
                assert.ok(view.el.textContent.indexOf('var second = 2;') >= 0, 'the text is not on screen');
            } finally {
                view.unmount();
            }
        });

        //THE MODES ARE REQUIRED, NOT FETCHED. Each mode file calls ace.define()
        //against the global ace sets up, so pulling it into the bundle registers
        //it -- and a packaged build with no server still has it. If that ever
        //regressed, ace would fall back to plain text and NOTHING would be
        //highlighted, silently.
        //
        //WHAT THIS PROVES IS THAT THE RULES ARE PRESENT, NOT WHICH FILE BROUGHT
        //THEM. Commenting out mode-javascript alone left this passing, because
        //ace's markdown mode pulls the javascript rules in for fenced code; all
        //three requires had to go before it went red. Worth knowing rather than
        //papering over -- the honest claim is "javascript is highlightable
        //here", and that is the claim a page depends on.
        it('highlights javascript', async function () {
            var view = await mount(React.createElement(editor.Code, {
                text: 'function hello(name) { return "hi " + name; }',
                mode: 'javascript'
            }));

            try {
                await view.until(function () { return view.find('.ace_line'); }, 'ace never rendered a line');
                assert.ok(view.find('.ace_keyword'), 'no keyword was highlighted: ace/mode/javascript did not load');
                assert.ok(view.find('.ace_string'), 'no string was highlighted');
            } finally {
                view.unmount();
            }
        });

        //THE DIFF MODE, ASKED THE ONLY WAY THAT WORKS.
        //
        //The first version counted elements whose class contained ace_ and
        //passed happily with mode-diff commented out, because ace's own
        //structural markup matches that. So this renders the same text twice,
        //once with the mode and once without, and asks whether they came out
        //differently -- which is what "the mode loaded" means, without this
        //test needing to know what ace calls an inserted line.
        it('highlights a diff differently from plain text', async function () {
            var DIFF = '--- a/one.js\n+++ b/one.js\n@@ -1,2 +1,2 @@\n-var a = 1;\n+var a = 2;';

            var plain = await mount(React.createElement(editor.Code, { text: DIFF }));
            var marked = await mount(React.createElement(editor.Code, { text: DIFF, mode: 'diff' }));

            try {
                //WAIT FOR THE LINES, NOT FOR THE TOKENS. Plain text has no
                //tokens at all -- that is the whole point of the comparison --
                //so waiting for a non-empty token set on the left-hand render
                //waits forever.
                await plain.until(function () { return plain.all('.ace_line').length; }, 'the plain render never laid out');
                await marked.until(function () { return marked.all('.ace_line').length; }, 'the diff render never laid out');
                await marked.until(function () { return tokens(marked).length; }, 'the diff render never tokenised');

                var without = tokens(plain).join(',');
                var withMode = tokens(marked).join(',');
                assert.notEqual(withMode, without,
                    'ace/mode/diff produced the same tokens as no mode at all: ' + without);
            } finally {
                plain.unmount();
                marked.unmount();
            }
        });

        //THE DEFAULT IS PLAIN TEXT, AND IT IS LOAD-BEARING. Highlighting prose
        //as javascript colours `delete`, `do` and `in` at random, which is false
        //emphasis on the one document somebody has to read every line of.
        it('leaves prose alone unless a mode was asked for', async function () {
            var prose = 'A judge may not delete what it did not create, and may not do so for another.';

            var plain = await mount(React.createElement(editor.Code, { text: prose }));
            var guessed = await mount(React.createElement(editor.Code, { text: prose, mode: 'javascript' }));

            try {
                await guessed.until(function () { return guessed.find('.ace_keyword'); },
                    'the comparison is meaningless: javascript mode highlighted nothing either');
                assert.equal(plain.find('.ace_keyword'), null,
                    'the default mode highlighted a word in prose');
                assert.ok(guessed.find('.ace_keyword'),
                    'the comparison is meaningless: javascript mode highlighted nothing either');
            } finally {
                plain.unmount();
                guessed.unmount();
            }
        });

        //READ-ONLY IN FOUR WAYS. This checks the two that are observable from
        //here; the other two are the hidden cursor and the worker that is never
        //started.
        it('will not take a keystroke', async function () {
            var view = await mount(React.createElement(editor.Code, { text: 'read me' }));

            try {
                await view.until(function () { return view.find('.ace_text-input'); },
                    'ace has no input to refuse with');
                var input = view.find('.ace_text-input');
                assert.ok(input.readOnly || input.getAttribute('readonly') !== null,
                    'the input is writable');
            } finally {
                view.unmount();
            }
        });

        //DESTROYED, NOT LEFT. Ace binds window resize and builds a text layer; a
        //pane that mounted one on every selection would leak an editor per click.
        it('takes its element with it when it goes', async function () {
            var view = await mount(React.createElement(editor.Code, { text: 'x' }));
            await view.until(function () { return view.find('.ace_editor'); }, 'never mounted');

            view.unmount();
            assert.equal(view.find('.ace_editor'), null);
        });

        //---- the diff -------------------------------------------------------
        //
        //A DIFF IS GEOMETRY, NOT MARKUP. ace-diff draws bands over rows, curves
        //between two editors and arrows in the gutter between them, all of it
        //positioned in pixels from a line height it measured. Nothing about that
        //can be checked by reading a string, which is why these mount it.

        //ace-diff's own class names, so a rename upstream fails here rather than
        //silently matching nothing
        var BAND = '.acediff__diffLine';
        var ARROW_RIGHT = '.acediff__copy--right';

        //the diff is computed off a debounce, so every question about it waits
        //for the bands rather than for a fixed number of frames
        async function banded(view, why) {
            await view.until(function () { return view.all(BAND).length > 0; },
                why || 'no line was ever marked as different');
        }

        it('hands out a diff, and two palettes', function () {
            assert.equal(typeof editor.Diff, 'function');
            assert.equal(typeof editor.look, 'function');

            assert.ok(editor.LOOKS.dark, 'no dark palette');
            assert.ok(editor.LOOKS.light, 'no light palette');
            assert.equal(editor.look('nonsense'), editor.LOOKS.dark);
            assert.equal(editor.look(), editor.LOOKS.dark);

            //stable, so passing look(mode) does not recolour on every render
            assert.equal(editor.look('light'), editor.look('light'));

            //A PALETTE HERE IS TWO THINGS, and both have to differ. An ace theme
            //alone leaves the diff bands drawn for the other ground; the custom
            //properties alone leave the code dark inside a light frame.
            assert.notEqual(editor.LOOKS.dark.theme, editor.LOOKS.light.theme);
            assert.notEqual(editor.LOOKS.dark.vars['--acediff-gutter-bg'],
                editor.LOOKS.light.vars['--acediff-gutter-bg']);
        });

        it('draws two editors and a gutter, in the box it was given', async function () {
            var view = await mount(React.createElement(editor.Diff, {
                left: 'one\ntwo\nthree', right: 'one\ntwo\nfour', height: 260
            }));

            try {
                await view.until(function () {
                    return view.all('.ace_editor').length >= 2;
                }, 'ace-diff never built its two editors');

                assert.ok(view.find('.acediff__left.ace_editor'), 'no left editor');
                assert.ok(view.find('.acediff__right.ace_editor'), 'no right editor');
                assert.ok(view.find('.acediff__gutter svg'), 'no gutter was drawn');

                //A DEFINITE BOX, because ace-diff's wrapper is absolutely
                //positioned against it -- a container sized by its content gives
                //it nothing and the whole diff collapses.
                var box = view.find('.diff').getBoundingClientRect();
                assert.ok(Math.abs(box.height - 260) < 4,
                    'the diff is ' + Math.round(box.height) + 'px, not the 260 it was given');
                assert.ok(box.width > 400, 'the diff is ' + Math.round(box.width) + 'px wide');
            } finally {
                view.unmount();
            }
        });

        //WHAT A DIFF IS FOR: saying which lines are not the same. Two mounts,
        //because a test that only sees bands cannot tell "it found the change"
        //from "it marks everything".
        it('marks the lines that differ, and marks nothing when they do not', async function () {
            var changed = await mount(React.createElement(editor.Diff, {
                left: 'alpha\nbeta\ngamma', right: 'alpha\nBETA\ngamma', height: 200
            }));
            var same = await mount(React.createElement(editor.Diff, {
                left: 'alpha\nbeta\ngamma', right: 'alpha\nbeta\ngamma', height: 200
            }));

            try {
                await banded(changed);
                for (var i = 0; i < 8; i++) await same.painted();

                assert.ok(changed.all(BAND).length > 0, 'the change was not marked');
                assert.equal(same.all(BAND).length, 0,
                    'two identical documents were marked as differing');
            } finally {
                changed.unmount();
                same.unmount();
            }
        });

        //THE CONNECTOR IS THE HALF THAT IS NOT IN EITHER EDITOR. A band says
        //"this line is not the same"; the shape drawn across the gutter says
        //WHICH line it is not the same as, which is the question a reader has
        //when a change moved something rather than edited it in place.
        it('draws a connector across the gutter, not just a band on each side', async function () {
            var view = await mount(React.createElement(editor.Diff, {
                left: 'alpha\nbeta\ngamma\ndelta',
                right: 'alpha\ngamma\ndelta',
                height: 220
            }));

            try {
                await banded(view);
                await view.until(function () {
                    return view.all('.acediff__connector').length > 0;
                }, 'nothing was drawn between the two sides');

                var shape = view.find('.acediff__connector');
                assert.ok(shape.getAttribute('d'), 'the connector has no path to draw');

                //IT HAS TO HAVE A SIZE. A gutter measured before it was laid out
                //gives an svg of zero width, which is a connector that exists in
                //the dom and is invisible on the screen -- and every assertion
                //above would still pass.
                var svg = view.find('.acediff__gutter svg').getBoundingClientRect();
                assert.ok(svg.width > 10 && svg.height > 10,
                    'the gutter svg is ' + Math.round(svg.width) + 'x' + Math.round(svg.height));
            } finally {
                view.unmount();
            }
        });

        //READ-ONLY UNTIL ASKED, AND THEN ONLY ON THE RIGHT. What is being judged
        //is the change FROM the left, so a left that can be edited is a diff
        //that can be made to say anything.
        it('is read-only until asked, and then only on the right', async function () {
            var reading = await mount(React.createElement(editor.Diff, {
                left: 'one\ntwo', right: 'one\nTWO', height: 200
            }));
            var merging = await mount(React.createElement(editor.Diff, {
                left: 'one\ntwo', right: 'one\nTWO', height: 200, editable: true
            }));

            try {
                await reading.until(function () { return reading.all('.ace_text-input').length >= 2; }, 'no inputs');
                await merging.until(function () { return merging.all('.ace_text-input').length >= 2; }, 'no inputs');

                function writable(view, side) {
                    var input = view.find('.acediff__' + side + ' .ace_text-input');
                    assert.ok(input, 'no input on the ' + side);
                    return !(input.readOnly || input.getAttribute('readonly') !== null);
                }

                assert.ok(!writable(reading, 'left'), 'the left side takes typing when only reading');
                assert.ok(!writable(reading, 'right'), 'the right side takes typing when only reading');

                assert.ok(!writable(merging, 'left'), 'the left side takes typing while merging');
                assert.ok(writable(merging, 'right'), 'the right side refuses typing while merging');
            } finally {
                reading.unmount();
                merging.unmount();
            }
        });

        //THE ARROWS ARE THE MERGE. Clicking one is the only thing in this app
        //that changes a document, so it is checked as a click rather than by
        //calling something -- and what comes back out of onChange is what the
        //caller would have to save.
        it('copies a change across when an arrow is clicked, and says what it now says', async function () {
            var said = [];
            var view = await mount(React.createElement(editor.Diff, {
                left: 'alpha\nbeta\ngamma', right: 'alpha\nBETA\ngamma',
                height: 220, editable: true,
                onChange: function (text) { said.push(text); }
            }));

            try {
                await banded(view);
                await view.until(function () {
                    return view.find(ARROW_RIGHT + ' div');
                }, 'no copy arrow was drawn, so nothing can be merged');

                assert.equal(said.length, 0, 'onChange fired before anything was touched');

                view.find(ARROW_RIGHT + ' div').click();

                await view.until(function () { return said.length > 0; },
                    'the arrow was clicked and nothing was reported');

                var now = said[said.length - 1];
                assert.ok(now.indexOf('beta') >= 0,
                    'the left line was not copied across: ' + JSON.stringify(now));
            } finally {
                view.unmount();
            }
        });

        //NO ARROWS WHEN NOTHING MAY MOVE. An arrow that does nothing is worse
        //than no arrow: it says the diff can be resolved here when it cannot.
        it('draws no arrows when it is only being read', async function () {
            var view = await mount(React.createElement(editor.Diff, {
                left: 'alpha\nbeta', right: 'alpha\nBETA', height: 200
            }));

            try {
                await banded(view);
                for (var i = 0; i < 6; i++) await view.painted();
                assert.equal(view.find(ARROW_RIGHT + ' div'), null,
                    'a read-only diff offered to copy a change across');
            } finally {
                view.unmount();
            }
        });

        //THE PALETTE HAS TO REACH THE ELEMENT ACE-DIFF MAKES, not ours. The
        //stylesheet sets the light defaults ON `.acediff`, so a value inherited
        //from a parent loses to it -- which is why this reads the colour the
        //browser computed rather than the style attribute the plugin set.
        it('paints the gutter in the palette it was given', async function () {
            var dark = await mount(React.createElement(editor.Diff, {
                left: 'a', right: 'b', height: 200, look: editor.look('dark')
            }));
            var light = await mount(React.createElement(editor.Diff, {
                left: 'a', right: 'b', height: 200, look: editor.look('light')
            }));

            try {
                await dark.until(function () { return dark.find('.acediff__gutter'); }, 'no gutter');
                await light.until(function () { return light.find('.acediff__gutter'); }, 'no gutter');

                function ground(view) {
                    return getComputedStyle(view.find('.acediff__gutter')).backgroundColor;
                }

                assert.notEqual(ground(dark), ground(light),
                    'both palettes painted the gutter ' + ground(dark));
            } finally {
                dark.unmount();
                light.unmount();
            }
        });

        //RECOLOURING NEVER REBUILDS -- the lesson ../xterm learned. With the
        //palette in the dependency list of the effect that BUILDS the diff, a
        //page going from dark to light would throw away the scroll position and,
        //while merging, whatever had been typed. Every other test here would
        //still pass.
        it('recolours without building the editors again', async function () {
            var props = {
                left: 'alpha\nbeta', right: 'alpha\nBETA',
                height: 200, look: editor.look('dark')
            };

            var view = await mount(React.createElement(editor.Diff, props));

            try {
                await view.until(function () { return view.find('.acediff__gutter'); }, 'no gutter');
                var before = view.find('.acediff__left.ace_editor');
                //ACE PUTS ITS CLASS ON THE ELEMENT ACE-DIFF MADE, not on a child
                //inside it -- and `.acediff__left .ace_editor` matched nothing,
                //so the identity check below was comparing null with null and
                //passing for it. Anything asserting "the same element" has to
                //say first that there was one.
                assert.ok(before, 'there is no left editor to compare against');
                var wasDark = getComputedStyle(view.find('.acediff__gutter')).backgroundColor;

                view.render(React.createElement(editor.Diff,
                    Object.assign({}, props, { look: editor.look('light') })));

                await view.until(function () {
                    return getComputedStyle(view.find('.acediff__gutter')).backgroundColor !== wasDark;
                }, 'the palette never reached the gutter');

                assert.equal(view.find('.acediff__left.ace_editor'), before,
                    'the editors were rebuilt to change colour');
            } finally {
                view.unmount();
            }
        });

        //TEXT CHANGES WITHOUT REBUILDING EITHER, so a list of files does not
        //tear down two editors per click.
        it('takes new text without building the editors again', async function () {
            var props = { left: 'alpha\nbeta', right: 'alpha\nBETA', height: 200 };
            var view = await mount(React.createElement(editor.Diff, props));

            try {
                await banded(view);
                var before = view.find('.acediff__right.ace_editor');
                assert.ok(before, 'there is no right editor to compare against');

                view.render(React.createElement(editor.Diff,
                    Object.assign({}, props, { right: 'alpha\nbeta\ndelta' })));

                await view.until(function () {
                    return view.el.textContent.indexOf('delta') >= 0;
                }, 'the new text never reached the right side');

                assert.equal(view.find('.acediff__right.ace_editor'), before,
                    'the editors were rebuilt to change the text');
            } finally {
                view.unmount();
            }
        });

        //DESTROYED, NOT LEFT: two ace editors, a scroll lock between them and
        //document-level handlers.
        it('takes both editors with it when it goes', async function () {
            var view = await mount(React.createElement(editor.Diff, {
                left: 'one', right: 'two', height: 200
            }));
            await view.until(function () { return view.all('.ace_editor').length >= 2; }, 'never mounted');

            view.unmount();
            assert.equal(view.all('.ace_editor').length, 0, 'an editor outlived the diff');
        });
    });

    register();
}
module.exports = plugin;
