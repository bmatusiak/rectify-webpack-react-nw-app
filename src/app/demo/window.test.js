//OPEN EVERY PAGE AND SEE THAT IT SURVIVES BEING OPENED.
//
//A page is a react component in its own module. If one of them throws while
//rendering -- a bad import, a property read off something undefined, a typo
//that only runs on that branch -- webpack builds it happily and the app starts
//happily, because nothing renders that page until somebody clicks it. The first
//anyone knows is a blank window, and there is no error boundary here to soften
//it: one page throwing takes the whole tree down with it.
//
//nothing outside the app can check this. It needs a document, react having
//mounted, and the click that actually mounts the page.
//
//WAITING IS THE WHOLE DIFFICULTY. Clicking is instant, rendering is not, and
//some pages ask the node half for data before they have anything to show. So
//each page is waited for twice: until it is the one on screen, and then until
//it stops changing. Asserting in between measures a page that is half built.

plugin.consumes = ['selftest', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var app = imports.app;

    function links() {
        return [].slice.call(document.querySelectorAll('.app-sidebar .nav-pills .nav-link'));
    }

    function main() { return document.querySelector('main'); }

    function press(el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    //poll until it is true, or say what it was still waiting for
    async function until(what, ok, seconds) {
        var deadline = Date.now() + (seconds || 10) * 1000;

        while (Date.now() < deadline) {
            if (ok()) return;
            await wait(100);
        }
        throw new Error('gave up waiting for ' + what);
    }

    //and then until it stops moving. A page that fetches renders twice, and the
    //second one is the one worth looking at.
    async function quiet(seconds) {
        var last = null;
        var deadline = Date.now() + (seconds || 10) * 1000;

        while (Date.now() < deadline) {
            var now = main() ? main().innerHTML.length : 0;
            if (now > 0 && now === last) return;
            last = now;
            await wait(120);
        }
    }

    //everything the page threw while it was being opened. React reports a
    //render failure through console.error before it rethrows, and a throw from
    //an effect or a promise arrives on window.
    function watching(where) {
        var seen = [];
        var said = console.error;

        //`where` is a function, not a string: what page was open matters at the
        //moment the complaint arrives, and an error with no page attached to it
        //is a search through twelve files
        function note(text) { seen.push(where() + ': ' + text); }

        function onError(e) { note(String((e && e.message) || e)); }
        function onRejection(e) { note('unhandled rejection: ' + String((e && e.reason) || e)); }

        console.error = function () {
            note(Array.prototype.map.call(arguments, String).join(' '));
            said.apply(console, arguments);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);

        return function stop() {
            console.error = said;
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            return seen;
        };
    }

    describe('every page opens', function () {

        //EVERY PLUGIN IS NAMED AFTER WHERE IT LIVES, and this is the only place
        //that can say so: src/target.js can be asked whether `stamp` works, and
        //only the running app can be asked whether the boot called it.
        //
        //It matters beyond the picture on the Graph page. `app.plugins` is what
        //rectify names in a resolution failure, and twenty-six records all
        //called `plugin` is a message that tells you nothing about which one.
        it('knows every plugin by where it lives, not as "plugin"', function () {
            var records = app.plugins;
            assert.ok(records && records.length > 5, 'no plugin records to look at');

            //A NAME HERE IS A PATH UNDER src/app, put on by the boot -- see
            //src/target.js. The first version of this test asked whether any
            //record was called `plugin`, and passed with the stamping removed:
            //rectify never leaves the literal name there, it substitutes "the
            //plugin providing [...]" instead. Asking for the shape that IS
            //wanted is the question that fails when the boot stops stamping.
            var unnamed = records.filter(function (p) {
                return String(p.name || '').indexOf('/') < 0;
            });

            //rectify's own PluginBase is pushed in by the boot and is not a
            //file under src/app, so one is expected
            assert.ok(unnamed.length <= 1,
                unnamed.length + ' of ' + records.length + ' are not named after a file: '
                + unnamed.map(function (p) { return p.name; }).join(' | '));
        });


        it('has a sidebar with pages on it', function () {
            assert.ok(links().length > 0, 'no pages in the sidebar');
        });

        it('opens each one, waits for it, and finds it rendered', async function () {
            var names = links().map(function (a) { return a.textContent.trim(); });
            var started = links().filter(function (a) { return a.classList.contains('active'); })[0];
            var startedOn = started ? started.textContent.trim() : names[0];

            var opening = startedOn;
            var stop = watching(function () { return opening; });
            var broken = [];

            try {
                for (var i = 0; i < names.length; i++) {
                    var name = names[i];
                    opening = name;

                    //found again each time: react replaces these nodes
                    var link = links().filter(function (a) { return a.textContent.trim() === name; })[0];
                    if (!link) { broken.push(name + ': its link went away'); continue; }

                    press(link);

                    try {
                        await until(name + ' to become the open page', function () {
                            var on = links().filter(function (a) { return a.classList.contains('active'); })[0];
                            return on && on.textContent.trim() === name;
                        });

                        await quiet();

                        //rendered, rather than merely selected
                        assert.ok(main(), 'there is no main element left at all');
                        assert.ok(main().textContent.trim().length > 0, name + ' rendered nothing');
                        assert.ok(main().querySelector('h1, h2, h4, .h2'), name + ' rendered no heading');
                    } catch (e) {
                        broken.push(name + ': ' + ((e && e.message) || e));
                    }
                }
            } finally {
                //put the page back, so what runs after this finds what it left
                var home = links().filter(function (a) { return a.textContent.trim() === startedOn; })[0];
                if (home) press(home);
            }

            var complaints = stop();

            assert.equal(broken.length, 0, 'pages that did not open: ' + broken.join(' | '));
            assert.equal(complaints.length, 0, 'errors while opening pages: ' + complaints.join(' | '));
        });

        it('still has its own react tree afterwards', async function () {
            //a page that throws unmounts everything, so an empty root is how
            //that failure looks from here rather than a thrown error
            await quiet(5);

            var root = document.getElementById('root');
            assert.ok(root, 'no #root');
            assert.ok(root.children.length > 0, 'react unmounted everything, which is what a page throwing does');
        });
    });

    register();
}
module.exports = plugin;
