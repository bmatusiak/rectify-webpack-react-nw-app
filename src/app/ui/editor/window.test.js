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
    });

    register();
}
module.exports = plugin;
