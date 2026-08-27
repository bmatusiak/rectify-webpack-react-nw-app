//THE KEY, AND THE NOTICE IT RAISES.
//
//THIS SUITE IS AN OUTSIDE CALLER, which is not a nuisance to work around -- it
//is one of the two cases this plugin has to get right. Every event a test
//dispatches is one the browser marks untrusted, exactly like something driving
//the window, so a press made from here must NOT quietly write the screen to
//disk. What these tests do IS the thing being tested.
//
//WHICH ALSO MEANS THIS SUITE CANNOT TAKE A REAL SNAPSHOT. Getting one requires
//the trusted press it refuses, so what is checked here is the listener, the
//question, and the notice -- and ./main.test.js takes the actual pair.
//
//AND EVERY TEST HERE ANSWERS ITS OWN QUESTION. A driven press raises a real
//dialog and waits for a real person; a suite that walked away from one would
//sit for the full two minutes and leave a modal over the app afterwards.

plugin.consumes = ['selftest', 'banner', 'may'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { banner, may } = imports;

    function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function press(how) {
        document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({
            key: 'D', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
        }, how || {})));
    }

    function ours() {
        return banner.list().filter(function (b) { return b.id === 'debug-snapshot'; })[0];
    }

    async function waitFor(get, seconds) {
        var until = Date.now() + (seconds || 5) * 1000;

        while (Date.now() < until) {
            var found = get();
            if (found) return found;
            await pause(50);
        }

        return null;
    }

    function dialogButton(box, words) {
        return [].slice.call(box.querySelectorAll('button')).filter(function (one) {
            return String(one.textContent || '').trim() === words;
        })[0];
    }

    describe('the snapshot key', function () {

        //THE CASE THE GUARD IS FOR, END TO END: ctrl+shift+D arrives, the press
        //is not a person's, and what comes back is a QUESTION rather than two
        //file paths. That is the whole design -- an outside caller gets a way to
        //ask instead of being refused outright or helping itself.
        it('asks a person instead of writing the screen down', async function () {
            //IF SOMEBODY HAS ALREADY ANSWERED, NO QUESTION IS RAISED and this
            //would be testing nothing. Saying so is what stops it passing blank
            //-- the same trap ../core/may/window.test.js documents for itself.
            if (may.answered('snapshot')) {
                return assert.ok(false,
                    'snapshot has already been answered (' + may.answered('snapshot') + '), so no '
                    + 'question could be raised and this proved nothing. Take it back on the '
                    + 'Guarded page, or with may.forget(), and run it again.');
            }

            banner.lower('debug-snapshot');
            press();

            var box = await waitFor(function () { return document.getElementById('may-asking'); });

            assert.ok(box, 'a driven press raised no question -- it either refused silently or went ahead');
            assert.ok(box.textContent.indexOf('snapshot') > 0, 'the question does not name what it is about');

            //SAYING NO IS THE ONE THING ANYTHING MAY DO, which is what lets this
            //suite clean up after itself. "Not now" is not an answer and is
            //never written down.
            dialogButton(box, 'Not now').click();

            var said = await waitFor(ours);

            assert.ok(said, 'the question went away and nothing said what happened');

            //A REFUSAL, NOT A PAIR OF PATHS. If this ever starts handing back
            //file names, a driven run has copied whatever was on screen to disk
            //without anybody agreeing to it.
            assert.ok(!/\.png|\.html/.test(said.text),
                'a driven press wrote the screen to disk: ' + said.text);
        });

        //AND THE MODIFIERS ARE REALLY REQUIRED. Without this the listener could
        //fire on any `d` anywhere -- a snapshot every time somebody typed into a
        //field -- and would still pass the test above.
        it('is not any press with a d in it', async function () {
            banner.lower('debug-snapshot');

            press({ ctrlKey: false, shiftKey: false });
            press({ ctrlKey: true, shiftKey: false });
            press({ ctrlKey: false, shiftKey: true });

            await pause(300);

            assert.equal(document.getElementById('may-asking'), null, 'a plain keypress asked about a snapshot');
            assert.equal(ours(), undefined, 'a plain keypress asked for a snapshot');
        });

        //THE NOTICE IS OFFERED WITH A BUTTON, which is the seam ../ui/banner
        //grew for this. A notice that names two paths and gives nobody a way to
        //take them is a notice somebody retypes by hand.
        it('has something to offer, rather than only something to say', function () {
            var id = banner.raise({
                id: 'probe-does', text: 'probe',
                does: [{ label: 'Copy', onClick: function () { } }]
            });

            try {
                var one = banner.list().filter(function (b) { return b.id === id; })[0];

                assert.ok(one, 'the banner never went up');
                assert.ok(one.does && one.does.length === 1, 'the banner dropped what it was given to do');
                assert.equal(one.does[0].label, 'Copy');
            } finally { banner.lower(id); }
        });
    });

    register();
}
module.exports = plugin;
