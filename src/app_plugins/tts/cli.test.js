//`say` and `voices` exist on the terminal side only to name their arguments and
//carry a help line -- ./server.js answers both over ipc, so they are reachable
//without ./cli.js at all, as json. What that file buys is `say "hello"` instead
//of `say {"text":"hello"}`, and that mapping is the thing worth pinning.
//
//NOTHING HERE REACHES THE APP, which is also why nothing here makes a sound:
//`ipc.call` is intercepted, so what is checked is what the terminal would ask
//for. ../../app/remote/cli.test.js does the same.

plugin.consumes = ['selftest', 'cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var cli = imports.cli;
    var ipc = imports.ipc;

    var asked = null;
    var real = ipc.call;

    function intercept(fn, answer) {
        asked = null;
        ipc.call = function (name, data) {
            asked = { name: name, data: data };
            return Promise.resolve(answer || { route: 'node', parts: 1 });
        };

        return Promise.resolve().then(fn)
            .then(function () { ipc.call = real; }, function (e) { ipc.call = real; throw e; });
    }

    describe('saying something from the terminal', function () {

        it('sends a bare sentence as the text', async function () {
            await intercept(async function () { await cli.run(['say', 'the build is done']); });

            assert.equal(asked.name, 'say');
            assert.equal(asked.data.text, 'the build is done');
        });

        //THE PUNCTUATION IS THE POINT of a sentence being one argument: it is
        //what ./speech.js chunks on, and a shell that split it would change
        //where the voice pauses.
        it('keeps punctuation and spacing intact', async function () {
            await intercept(async function () {
                await cli.run(['say', 'One. Two, three; four?']);
            });

            assert.equal(asked.data.text, 'One. Two, three; four?');
        });

        it('still takes json when the name does not cover everything', async function () {
            await intercept(async function () {
                await cli.run(['say', '{"text":"hello","rate":1.5,"voice":"Zira"}']);
            });

            assert.equal(asked.data.text, 'hello');
            assert.equal(asked.data.rate, 1.5);
            assert.equal(asked.data.voice, 'Zira');
        });

        //A SPOKEN PARAGRAPH OUTLASTS EVERY OTHER TIMEOUT IN THIS APP. A click is
        //given eight seconds; reading a page aloud takes longer than that and is
        //not stuck, so the terminal must not decide it failed.
        it('waits far longer than a click would', async function () {
            var given = null;
            var was = ipc.call;

            ipc.call = function (name, data, timeout) { given = timeout; return Promise.resolve({ parts: 1 }); };
            try { await cli.run(['say', 'hello']); } finally { ipc.call = was; }

            assert.ok(given >= 60000, 'a spoken paragraph was given only ' + given + 'ms');
        });

        it('asks the app what voices there are rather than looking itself', async function () {
            await intercept(async function () { await cli.run(['voices']); },
                { voices: ['Microsoft Zira Desktop'] });

            assert.equal(asked.name, 'voices');
        });

        //NO SYNTHESIZER IS A NORMAL ANSWER on a bare linux box, and saying so is
        //most of what this command is for: `say` going quiet is otherwise
        //indistinguishable from `say` being broken.
        it('says so when the machine has no voices at all', async function () {
            var said = [];
            var log = console.log;
            console.log = function (line) { said.push(String(line)); };

            try {
                await intercept(async function () { await cli.run(['voices']); }, { voices: [] });
            } finally { console.log = log; }

            assert.ok(said.join(' ').indexOf('none') >= 0, 'it said: ' + said.join(' '));
        });
    });

    register();
}
module.exports = plugin;
