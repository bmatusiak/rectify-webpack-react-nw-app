//THE NODE ROUTE, IN THE RUNNING APP, WITHOUT ANYBODY HEARING IT.
//
//Everything here either makes no sound at all -- listing voices spawns the real
//synthesizer and asks it a question -- or speaks at `volume: 0`, which reaches
//SAPI, `say` and espeak as a real volume rather than a skipped call. That is
//what ./node.test.js checks on all three platforms, and it is the reason this
//suite can run inside an app somebody is using.
//
//What ./speech.js decides is tested there, in this process, in a millisecond.
//This is about the half: that the child really runs, that a reload can kill it,
//and that the two ways in answer the same way.

var speech = require('./speech');

plugin.consumes = ['selftest', 'tts', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var tts = imports.tts;
    var ipc = imports.ipc;

    //short, because every second of it is a second of the suite
    var SILENT = { volume: 0, rate: 2 };

    describe('tts, on the node side of the running app', function () {

        //THE ONE END-TO-END CHECK THAT CANNOT MAKE A NOISE. It spawns the real
        //synthesizer, on this platform, and reads back what it said -- so a
        //broken command, a missing binary or unparsable output all fail here
        //rather than the first time somebody asks the app to speak.
        it('asks the machine what voices it has', async function () {
            var voices = await tts.voices();

            assert.ok(Array.isArray(voices), 'not a list: ' + JSON.stringify(voices));

            //AN EMPTY LIST IS A PASS. A CI runner with no speech-dispatcher
            //backend has none, and that is the machine's answer rather than
            //this plugin's fault -- but if there ARE voices they must be names,
            //not blank lines or a column header.
            voices.forEach(function (name) {
                assert.equal(typeof name, 'string');
                assert.ok(name.trim().length > 0, 'a blank voice name came back');
            });
        });

        it('says nothing is an error rather than silence', async function () {
            var refused = null;
            try { await tts.speak(''); } catch (e) { refused = e; }
            assert.ok(refused, 'an empty string was accepted, so the app would just go quiet');

            refused = null;
            try { await tts.speak('   '); } catch (e) { refused = e; }
            assert.ok(refused, 'whitespace was accepted');
        });

        it('speaks, and says how it did it', async function () {
            var out = await tts.speak('Testing.', SILENT);

            assert.equal(out.route, 'node');
            assert.equal(out.parts, 1);
        });

        //THE SAME TEXT BREAKS IN THE SAME PLACES ON BOTH SIDES, because both
        //halves chunk through ./speech.js. A caller comparing the routes should
        //hear one reading, not two.
        it('breaks a paragraph into the parts speech.js says', async function () {
            var text = 'One. Two. Three three three. Four four four four.';
            var expected = speech.chunk(text, 30).length;

            assert.ok(expected > 1, 'the text did not chunk, so this proves nothing');

            var out = await tts.speak(text, { volume: 0, rate: 2, max: 30 });
            assert.equal(out.parts, expected);
        });

        //A RELOAD MUST TAKE THE VOICE WITH IT. This half is torn down and
        //rebuilt on every save, and a synthesizer started by the previous build
        //goes on talking with no handle left anywhere to stop it -- found by
        //editing ./server.js while it was mid sentence.
        it('stop kills what is speaking rather than waiting for it', async function () {
            var long = 'This is a long sentence that would take a while to read out loud in full. '.repeat(4);

            var speaking = tts.speak(long, { volume: 0, rate: 0.8 });

            //give the child a moment to actually exist, then take it away
            await new Promise(function (r) { setTimeout(r, 250); });
            assert.ok(tts.speaking, 'nothing was running to stop');

            var at = Date.now();
            tts.stop();

            await speaking;//resolves rather than throwing: it was stopped, not broken
            var took = Date.now() - at;

            assert.ok(!tts.speaking, 'something is still running after stop');
            assert.ok(took < 4000, 'stop waited ' + took + 'ms, which is not stopping');
        });

        //`say` IS A VERB SOMEBODY TYPES, and the terminal and the page both
        //arrive at this one implementation. If the ipc name ever drifts, the cli
        //keeps its help line and stops working.
        it('answers `say` and `voices` over ipc', async function () {
            var said = await ipc.invoke('say', Object.assign({ text: 'Testing.' }, SILENT));
            assert.equal(said.route, 'node');

            var listed = await ipc.invoke('voices');
            assert.ok(Array.isArray(listed.voices), 'voices did not come back as a list');
        });

        it('reports an empty text over ipc as an error, not as a success', async function () {
            var failed = null;
            try { await ipc.invoke('say', { text: '' }); } catch (e) { failed = e; }

            assert.ok(failed, 'ipc reported saying nothing as done');
        });
    });

    register();
}
module.exports = plugin;
