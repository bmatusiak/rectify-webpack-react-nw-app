
//click, fill and read exist on the terminal side only to name their arguments.
//The app answers all three over ipc, so they would be reachable without this
//file at all -- just as json. What it buys is `click Save` instead of
//`click {"selector":"Save"}`, and that mapping is the thing worth pinning.

plugin.consumes = ['selftest', 'cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var cli = imports.cli;
    var ipc = imports.ipc;

    var asked = null;
    var real = ipc.call;

    function intercept(fn, answer) {
        ipc.call = function (name, data) {
            asked = { name: name, data: data };
            return Promise.resolve(answer || { clicked: { element: 'button', text: 'ok' } });
        };

        return Promise.resolve().then(fn)
            .then(function () { ipc.call = real; }, function (e) { ipc.call = real; throw e; });
    }

    describe('click, fill and read from the terminal', function () {

        it('sends a bare word as the selector', async function () {
            await intercept(async function () { await cli.run(['click', 'Save']); });

            assert.equal(asked.name, 'click');
            assert.equal(asked.data.selector, 'Save');
        });

        it('sends a css selector the same way, since the app decides which it is', async function () {
            await intercept(async function () { await cli.run(['click', '.btn-primary']); });
            assert.equal(asked.data.selector, '.btn-primary');
        });

        it('takes two words for fill, in the order they are typed', async function () {
            await intercept(async function () { await cli.run(['fill', '#email', 'me@here']); },
                { filled: { element: 'input' }, value: 'me@here' });

            assert.equal(asked.name, 'fill');
            assert.equal(asked.data.selector, '#email');
            assert.equal(asked.data.value, 'me@here');
        });

        it('lets a value with spaces through as one word', async function () {
            await intercept(async function () { await cli.run(['fill', '#note', 'two words']); },
                { filled: { element: 'input' }, value: 'two words' });

            assert.equal(asked.data.value, 'two words');
        });

        it('still takes json when the names do not cover it', async function () {
            await intercept(async function () {
                await cli.run(['click', '{"x":10,"y":20}']);
            });

            assert.equal(asked.data.x, 10);
            assert.equal(asked.data.y, 20);
            assert.ok(!asked.data.selector, 'a selector was invented');
        });

        it('asks the app to read rather than reading anything itself', async function () {
            await intercept(async function () { await cli.run(['read', 'h1']); },
                { count: 1, element: 'h1', text: 'Title', value: null, checked: null, visible: true });

            assert.equal(asked.name, 'read');
            assert.equal(asked.data.selector, 'h1');
        });

        //---- and a refusal, which is an answer -------------------------
        //
        //A REFUSAL THAT PRINTS NOTHING AND EXITS 0 READS EXACTLY LIKE SUCCESS.
        //Measured before this was covered: `node src/cli.js click Guarded`
        //against a build that refused it was silent and successful -- and
        //../../../tools/drive.js reads exit codes, so it would have counted
        //every refusal as a pass.
        //
        //ITS OWN SABOTAGE FOUND THE GAP by surviving: ./cli.js was broken on
        //purpose and every check here still passed, because none of them ever
        //handed it an answer that said no.

        it('fails rather than going quiet when the app refuses', async function () {
            var threw = null;

            await intercept(function () {
                return cli.run(['click', 'Save']);
            }, { refused: 'nobody allowed snapshot' }).catch(function (e) { threw = e; });

            assert.ok(threw, 'a refusal came back and the terminal said nothing about it');
        });

        //AND IN THE APP'S OWN WORDS. A refusal reworded here is a refusal that
        //cannot say which capability, which build, or where to look -- and
        //those sentences are the whole of what makes one actionable.
        it('says what the app said, rather than a sentence of its own', async function () {
            var threw = null;

            await intercept(function () {
                return cli.run(['read', '#secret']);
            }, { refused: 'this build is closed, see config.may.open' })
                .catch(function (e) { threw = e; });

            assert.ok(threw, 'a refused read came back silently');
            assert.ok(String(threw.message).indexOf('config.may.open') >= 0,
                'the refusal was reworded on the way out: ' + threw.message);
        });
    });

    register();
}
module.exports = plugin;
