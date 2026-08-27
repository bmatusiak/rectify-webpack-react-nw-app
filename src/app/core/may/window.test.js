//ASKING THE PERSON, IN THE PAGE THAT WOULD ASK THEM.
//
//THE WHOLE POINT OF THIS FILE IS THAT IT CANNOT GET A YES. A suite runs by being
//driven, and a driven press is exactly what this plugin refuses -- so a test
//here that managed to allow something would be proving the opposite of what the
//plugin claims.

plugin.consumes = ['selftest', 'may'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var may = imports.may;

    describe('asking the person', function () {

        //MIRRORED FROM MAIN, AND ASKED FOR RATHER THAN ONLY WAITED FOR. The
        //first list goes out when the page connects, which is before this
        //plugin has attached its listener -- so it asks as well, and this is
        //what says the asking worked.
        it('knows what is guarded without waiting to be told', function () {
            assert.equal(may.asks('serve'), true, 'the guard list never arrived');
            assert.equal(may.asks('markup'), true);
            assert.equal(may.asks('probe-nobody-guards-this'), false);
        });

        //`isTrusted` IS THE BROWSER'S OWN AND A PAGE CANNOT FORGE IT. This is
        //the check the whole design rests on, asked with the exact kind of event
        //../../remote/window.js builds to drive this app.
        it('refuses a press the browser did not call a person\'s', async function () {
            var made = new MouseEvent('click', { bubbles: true, cancelable: true });

            assert.equal(made.isTrusted, false, 'a constructed event claimed to be trusted');

            var out = await may('serve', made);

            assert.equal(out.allowed, false, 'a synthetic press was allowed');
            assert.ok(out.why.indexOf('untrusted') > 0, out.why);
        });

        it('refuses a press with no event at all', async function () {
            var out = await may('serve');
            assert.equal(out.allowed, false, 'a call with no press behind it was allowed');
        });

        //AND IT PUTS NOTHING ON SCREEN FOR ONE. A prompt raised for a driven
        //click is a prompt a second driven click can answer -- the dialog would
        //become the way around the dialog.
        it('does not put a prompt up for a press it refused', async function () {
            await may('markup', new MouseEvent('click', { bubbles: true }));

            assert.equal(document.getElementById('may-asking'), null,
                'it asked about a press it had already refused');
        });

        //A DECISION IS NEVER MADE HERE. The page holds none, because the page is
        //the thing being driven.
        it('will not record a decision itself', function () {
            assert.ok(may.decide('serve', 'always').refused);
        });
    });

    register();
}
module.exports = plugin;
