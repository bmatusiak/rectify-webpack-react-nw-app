var React = require('react');

//MARKDOWN, IN A REAL WINDOW.
//
//The plugin's whole claim is that what it renders cannot do anything, and that
//claim is about a Content-Security-Policy a real browser has to enforce. It
//cannot be checked by reading the string: the policy has to be parsed and the
//markup has to be refused. So these mount the frame and then look inside it.

plugin.consumes = ['selftest', 'markdown', 'io'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var markdown = imports.markdown;
    var io = imports.io;

    //a round trip to the node half, which only completes if this page can still
    //reach main and be answered
    function reachesTheApp(ms) {
        return new Promise(function (resolve) {
            var timer = setTimeout(function () { resolve(null); }, ms || 4000);
            io.emit('ping', {}, function (pong) { clearTimeout(timer); resolve(pong); });
        });
    }

    var LT = String.fromCharCode(60);

    //the frame is same-origin -- there is no sandbox attribute, deliberately --
    //so a test can read what the browser made of the document
    async function inside(view) {
        var frame = view.find('iframe.md');
        assert.ok(frame, 'the frame never rendered');

        //srcdoc parses on its own schedule; wait for a body with something in it
        for (var i = 0; i < 40; i++) {
            var doc = frame.contentDocument;
            if (doc && doc.body && doc.body.childNodes.length) return doc;
            await view.painted();
        }
        assert.ok(false, 'the frame never parsed its document');
    }

    describe('markdown, in a real window', function () {

        it('hands out the frame and nothing else', function () {
            assert.equal(typeof markdown.Frame, 'function');
        });

        //A FRAME CANNOT INHERIT ANYTHING. Everything else in the app takes its
        //colours from the page around it; a document in an iframe has no page
        //around it, so the whole stylesheet is handed over -- which is why this
        //is two complete palettes rather than a colour or two.
        it('carries two palettes, and defaults to dark', function () {
            assert.equal(typeof markdown.look, 'function');
            assert.ok(markdown.LOOKS.dark, 'no dark palette');
            assert.ok(markdown.LOOKS.light, 'no light palette');

            assert.equal(markdown.look('nonsense'), markdown.LOOKS.dark);
            assert.equal(markdown.look(), markdown.LOOKS.dark);

            //stable, so a page passing look(mode) does not hand the frame a new
            //srcdoc on every render
            assert.equal(markdown.look('light'), markdown.look('light'));

            assert.notEqual(markdown.LOOKS.dark.colours.bg, markdown.LOOKS.light.colours.bg);
            assert.notEqual(markdown.LOOKS.dark.colours.text, markdown.LOOKS.light.colours.text);
        });

        it('paints the document in the palette it was given', async function () {
            var view = await mount(React.createElement(markdown.Frame, {
                text: '# a heading', height: 200, look: markdown.look('light')
            }));

            try {
                var doc = await inside(view);
                var body = doc.body;
                var painted = doc.defaultView.getComputedStyle(body).backgroundColor;

                //rgb(255,255,255) rather than the dark ground
                assert.ok(/25[0-9]|255/.test(painted), 'the light palette did not reach the frame: ' + painted);
            } finally {
                view.unmount();
            }
        });

        it('renders markdown as markup', async function () {
            var view = await mount(React.createElement(markdown.Frame, {
                text: '# A heading\n\nSome **bold** text.\n\n| a | b |\n|---|---|\n| 1 | 2 |',
                height: 300
            }));

            try {
                var doc = await inside(view);
                assert.ok(doc.querySelector('h1'), 'no heading was rendered');
                assert.ok(doc.querySelector('strong'), 'no bold was rendered');
                assert.ok(doc.querySelector('table td'), 'no table was rendered');
                assert.ok(doc.body.textContent.indexOf('A heading') >= 0);
            } finally {
                view.unmount();
            }
        });

        //A DOCUMENT THAT GROWS SHOULD NOT BE CUT OFF INSIDE THE FRAME.
        //
        //Without `fit` the caller guesses a height, and a scrollbar inside a
        //panel that is already inside a scrolling page is two scrollbars for one
        //document. The frame is same-origin, so this side can measure what the
        //browser actually made of it rather than guess.
        it('fits its box to the document when asked, and not otherwise', async function () {
            var long = [];
            for (var i = 0; i < 40; i++) long.push('Paragraph ' + i + ', which is here to take up room.\n');

            var fixed = await mount(React.createElement(markdown.Frame, {
                text: long.join('\n'), height: 200
            }));
            var fitted = await mount(React.createElement(markdown.Frame, {
                text: long.join('\n'), height: 200, fit: true
            }));

            try {
                await inside(fixed);
                await inside(fitted);
                for (var f = 0; f < 8; f++) { await fixed.painted(); await fitted.painted(); }

                var asked = fixed.find('iframe.md').getBoundingClientRect().height;
                var grown = fitted.find('iframe.md').getBoundingClientRect().height;

                assert.ok(Math.abs(asked - 200) < 4, 'the unfitted one is ' + Math.round(asked) + ', not 200');
                assert.ok(grown > asked + 200,
                    'forty paragraphs fitted into ' + Math.round(grown) + 'px');

                //and what it fitted to is the document, not a number that merely
                //grew: nothing should be left to scroll
                var doc = fitted.find('iframe.md').contentDocument;
                assert.ok(grown >= doc.body.scrollHeight - 4,
                    'the frame is ' + Math.round(grown) + 'px around a ' + doc.body.scrollHeight + 'px document');
            } finally {
                fixed.unmount();
                fitted.unmount();
            }
        });

        //AND IT COMES BACK DOWN, which is the assertion that tells
        //`body.scrollHeight` from the root's. The root's is never less than the
        //box it is in, so a frame measured that way grows once and then stays
        //grown for every document after it -- and every check above would still
        //pass.
        it('comes back down when the document gets shorter', async function () {
            var long = [];
            for (var i = 0; i < 40; i++) long.push('Paragraph ' + i + '.\n');

            var view = await mount(React.createElement(markdown.Frame, {
                text: long.join('\n'), height: 200, fit: true
            }));

            try {
                await inside(view);
                await view.until(function () {
                    return view.find('iframe.md').getBoundingClientRect().height > 500;
                }, 'the long document never grew the frame');

                view.render(React.createElement(markdown.Frame, {
                    text: 'one line', height: 200, fit: true
                }));

                await view.until(function () {
                    return view.find('iframe.md').getBoundingClientRect().height < 240;
                }, 'the frame stayed tall after the document got short');
            } finally { view.unmount(); }
        });

        //AND `height` IS THE FLOOR, so one line does not collapse the panel
        it('does not shrink below the height it was given', async function () {
            var view = await mount(React.createElement(markdown.Frame, {
                text: 'one line', height: 300, fit: true
            }));

            try {
                await inside(view);
                for (var i = 0; i < 8; i++) await view.painted();
                var tall = view.find('iframe.md').getBoundingClientRect().height;
                assert.ok(tall >= 296, 'one line collapsed it to ' + Math.round(tall) + 'px');
            } finally { view.unmount(); }
        });

        //THE FRAME FILLS ITS BOX. An iframe with nothing said about it is 300px
        //wide whatever it is in, which is how a rendered document came out as a
        //narrow column. The plugin sets this itself rather than relying on a
        //stylesheet, because the theme is a slot you are expected to replace.
        it('fills the width it was given', async function () {
            var view = await mount(React.createElement(markdown.Frame, { text: 'x', height: 200 }));

            try {
                var frame = view.find('iframe.md');
                var box = frame.getBoundingClientRect();
                var host = view.el.getBoundingClientRect();
                assert.ok(box.width > host.width - 4,
                    'the frame is ' + Math.round(box.width) + 'px in a ' + Math.round(host.width) + 'px box');
            } finally {
                view.unmount();
            }
        });

        it('carries the policy that makes it safe', async function () {
            var view = await mount(React.createElement(markdown.Frame, { text: 'x', height: 200 }));

            try {
                var doc = await inside(view);
                var meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
                assert.ok(meta, 'no policy in the document');

                var policy = meta.getAttribute('content');
                assert.ok(policy.indexOf("default-src 'none'") >= 0, 'default-src is not none: ' + policy);
                assert.ok(policy.indexOf('img-src data:') >= 0, 'img-src is not restricted: ' + policy);
                assert.ok(policy.indexOf("script-src 'unsafe-inline'") < 0, 'inline script is permitted');
            } finally {
                view.unmount();
            }
        });

        //THE ONE THAT IS ACTUALLY A TEST.
        //
        //A script and an inline handler that WOULD overwrite the text beside
        //them, if the policy stopped holding. The assertion is on what the text
        //says afterwards, which is the same thing the Markdown page shows a
        //person -- so if this ever fails, the page fails visibly too.
        it('refuses a script and an inline handler', async function () {
            var doc = [
                LT + 'p id="one">the script did not run' + LT + '/p>',
                LT + 'script>document.getElementById("one").textContent = "THE SCRIPT RAN";' + LT + '/script>',
                '',
                LT + 'p id="two">the handler did not run' + LT + '/p>',
                LT + 'img src="x" onerror=\'document.getElementById("two").textContent = "THE HANDLER RAN"\'>'
            ].join('\n');

            var view = await mount(React.createElement(markdown.Frame, { text: doc, height: 300 }));

            try {
                var inner = await inside(view);

                //the img has to fail before its onerror could have run, so give
                //the frame a few frames to try and be refused
                for (var i = 0; i < 20; i++) await view.painted();

                var one = inner.getElementById('one');
                var two = inner.getElementById('two');
                assert.ok(one, 'the exhibit did not render');
                assert.equal(one.textContent, 'the script did not run');
                assert.ok(two, 'the second exhibit did not render');
                assert.equal(two.textContent, 'the handler did not run');
            } finally {
                view.unmount();
            }
        });

        //RENDERING THE FRAME MUST NOT COST THE APP ITS CONNECTION.
        //
        //THE BUG THIS EXISTS FOR. nw fires document-start and document-end for
        //every frame in the window, iframes included, and the object handed over
        //is that frame's Window either way -- so main, which listens for those
        //to find the page, quietly repointed itself at this iframe the moment
        //the Markdown page rendered. Everything main said after that went to the
        //iframe and was refused by chromium with a console warning, and the app
        //stopped answering while looking perfectly fine on screen.
        //
        //It cost an afternoon because the failure was so far from the cause:
        //`click` and `read` timed out, the window suite hung for its full two
        //minutes, and one page in the demo was to blame for all of it.
        //
        //A round trip is the whole assertion. If main is talking to the wrong
        //document, no answer comes back.
        it('renders the frame without costing the app its connection', async function () {
            var before = await reachesTheApp();
            assert.ok(before && before.pong, 'the app was already unreachable before this test');

            var view = await mount(React.createElement(markdown.Frame, {
                text: '# a document in an iframe', height: 200
            }));

            try {
                await inside(view);

                var after = await reachesTheApp();
                assert.ok(after && after.pong,
                    'rendering the frame took the connection with it: main is talking to the iframe');
                assert.equal(after.pid, before.pid, 'a different process answered');
            } finally {
                view.unmount();
            }
        });

        //NOTHING IS AN EMPTY DOCUMENT, NOT THE WORD "null".
        //
        //`String(text)` on a missing value renders the four characters n-u-l-l,
        //which is the kind of bug that survives review because the panel looks
        //populated. A parse failure is said inside the frame rather than thrown,
        //for the same reason: the source view beside it still works and is what
        //somebody would fall back to anyway.
        it('renders nothing as nothing', async function () {
            var view = await mount(React.createElement(markdown.Frame, { text: null, height: 200 }));

            try {
                var frame = view.find('iframe.md');
                assert.ok(frame, 'the frame never rendered');

                //no wait for content here: the point is that there is none
                for (var i = 0; i < 10; i++) await view.painted();

                var doc = frame.contentDocument;
                assert.ok(doc && doc.body, 'the frame never made a document');
                assert.equal(doc.body.textContent.trim(), '');
                assert.ok(doc.querySelector('meta[http-equiv="Content-Security-Policy"]'),
                    'an empty document is still a document, and still needs the policy');
            } finally {
                view.unmount();
            }
        });
    });

    register();
}
module.exports = plugin;
