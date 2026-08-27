//ASKING THE PERSON, IN THE PAGE THAT WOULD ASK THEM.
//
//A SUITE IS AN OUTSIDE CALLER, and that is not a nuisance to work around -- it
//is the case this plugin exists for, arriving for free. Every press this file
//makes is one the browser marks untrusted, exactly like a model driving the
//window, so what these tests do IS the thing being tested.
//
//WHICH MEANS EVERY TEST HERE HAS TO ANSWER ITS OWN QUESTION. A `may` call from
//here raises a real dialog and waits for a real person; the first version of
//this file did not know that and the suite sat for the full two minutes before
//the prompt gave up.

plugin.consumes = ['selftest', 'may'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var may = imports.may;

    function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    async function asked(seconds) {
        var until = Date.now() + (seconds || 5) * 1000;

        while (Date.now() < until) {
            var box = document.getElementById('may-asking');
            if (box) return box;
            await pause(50);
        }

        return null;
    }

    function button(box, words) {
        return [].slice.call(box.querySelectorAll('button')).filter(function (one) {
            return String(one.textContent || '').trim() === words;
        })[0];
    }

    describe('asking the person', function () {

        //MIRRORED FROM MAIN, AND ASKED FOR RATHER THAN ONLY WAITED FOR. The
        //first list goes out when the page connects, which is before this plugin
        //has attached its listener -- so it asks as well, and this is what says
        //the asking worked.
        it('knows what is guarded without waiting to be told', function () {
            assert.equal(may.asks('serve'), true, 'the guard list never arrived');
            assert.equal(may.asks('markup'), true);
            assert.equal(may.asks('probe-nobody-guards-this'), false);
        });

        //THE CASE THE WHOLE PLUGIN IS FOR. Something that is not a person wants
        //to do a guarded thing, so a person is asked -- rather than the caller
        //being refused outright, which would leave a model no way to ask, or
        //helping itself, which is the thing being prevented.
        it('asks a person when something outside wants a guarded thing', async function () {
            //SOMETHING NOBODY HAS ANSWERED YET, chosen at run time rather than
            //named here. `serve` was named here, somebody answered `always` for
            //it during an afternoon of testing, and this then quietly asserted
            //that a question was raised about a thing that no longer raises one.
            //A suite depending on a decision it does not control goes red for
            //the wrong reason.
            var open = may.undecided();

            //NOTHING LEFT TO ASK ABOUT IS A REAL STATE -- a person may have
            //answered everything -- but it must not be a blank pass. Saying WHY
            //is what stops this quietly testing nothing, which is exactly how
            //two of its own sabotages survived once.
            if (!open.length) {
                return assert.ok(false,
                    'every guarded thing has already been answered, so no question could be '
                    + 'raised -- which means this test proved nothing. Take one back with '
                    + 'may.forget() and run it again.');
            }

            var name = open[0];
            var wanting = may(name, new MouseEvent('click', { bubbles: true }));

            var box = await asked();
            assert.ok(box, 'nothing was asked of anybody');
            assert.ok(box.textContent.indexOf(name) > 0, 'the question does not name what it is about');

            //AND A DRIVEN CLICK CANNOT ANSWER IT. Otherwise the prompt is the
            //way around the prompt: one press to raise the question, another to
            //say yes to it.
            //
            //IT PRESSES "JUST THIS ONCE" AND NOT "ALWAYS", and that is not a
            //detail. When this file's own sabotage breaks the trusted-press
            //check, the press SUCCEEDS -- and `always` is written to disk, in
            //the real app, for ever. One sabotage run left `serve`, `markup` and
            //`demo:password` all permanently allowed, which is a test probe
            //turning into a standing grant.
            //
            //`once` is never written down, so the same probe proves the same
            //thing and leaves nothing behind when it is the code that is broken.
            var allow = button(box, 'Just this once');
            assert.ok(allow, 'the dialog offers no way to allow');

            allow.click();
            await pause(150);

            assert.ok(document.getElementById('may-asking'),
                'a press the browser called untrusted answered the question');

            //REFUSING, THOUGH, IS SAFE FROM ANYTHING. A dialog only a person can
            //dismiss is one that sits over the app until somebody comes back.
            button(box, 'Not now').click();

            var out = await wanting;
            assert.equal(out.allowed, false, 'it went ahead after being told not now');
        });

        //A PERSON IS NOT ASKED ANYTHING. Their press is the consent, and a dialog
        //confirming what somebody just did is one they learn to click through.
        //
        //THE EVENT CANNOT BE FORGED FROM HERE, which is why this asserts the
        //shape rather than the outcome: `isTrusted` is the browser's own, and a
        //suite that could set it would be a suite proving the opposite.
        it('cannot forge the one thing that would let it skip the question', function () {
            var made = new MouseEvent('click', { bubbles: true, cancelable: true });

            assert.equal(made.isTrusted, false, 'a constructed event claimed to be trusted');

            //and setting it does not take, which is the guarantee being relied on
            try { Object.defineProperty(made, 'isTrusted', { value: true }); } catch (e) { /* refused outright */ }

            assert.equal(made.isTrusted, false, 'isTrusted could be written, so it guarantees nothing');
        });

        it('lets anything through that nobody guards, without asking', async function () {
            var out = await may('probe-nobody-guards-this', new MouseEvent('click', { bubbles: true }));

            assert.equal(out.allowed, true);
            assert.equal(document.getElementById('may-asking'), null, 'it asked about something nobody guards');
        });

        //A DECISION IS NEVER MADE HERE. The page holds none, because the page is
        //the thing being driven.
        it('will not record a decision itself', function () {
            assert.ok(may.decide('serve', 'always').refused);
        });

        //WHAT A SCREEN DRAWS. It is the mirror rather than a question, so it
        //answers on the first frame -- a list that had to be awaited would paint
        //an empty table and fill it in afterwards, which on this page reads as
        //"nothing is guarded".
        it('can say what is guarded and what was said about it, without asking', function () {
            var rows = may.decisions();

            assert.ok(rows.length > 0, 'the list is empty, so a screen would say nothing is guarded');

            var serve = rows.filter(function (one) { return one.name === 'serve'; })[0];

            assert.ok(serve, 'serve is not in the list');
            assert.ok(serve.about && serve.about.length > 0, 'it does not say what serve is');

            //`always` AND "for this run" LOOK IDENTICAL FROM `answer` ALONE, and
            //a screen offering to take back something that was never written
            //would be offering to undo nothing.
            assert.equal(typeof serve.remembered, 'boolean', 'it cannot say whether it was written down');
        });

        //AND TAKING ONE BACK IS A DECISION, so this suite cannot do it either.
        //Forgetting only ever makes the app do less, which is exactly why it
        //looks safe to allow -- but a driven run that could forget things could
        //clear a `never`, and the next caller would be asked about something a
        //person had already refused.
        it('cannot take a decision back with a press the browser called untrusted', async function () {
            var out = await may.forget('probe-may-window-forget',
                new MouseEvent('click', { bubbles: true }));

            assert.ok(out && out.refused, 'a driven press forgot a decision');
            assert.ok(out.refused.indexOf('press') > 0 || out.refused.indexOf('person') > 0, out.refused);
        });
    });

    register();
}
module.exports = plugin;
