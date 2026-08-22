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
