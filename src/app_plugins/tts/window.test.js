var speech = require('./speech');

//THE WEB SPEECH ROUTE, IN THE REAL WINDOW, AT VOLUME 0.
//
//`volume: 0` is a real utterance with a real voice attached: it is queued,
//spoken and `end` fires, and nobody hears it. That is what lets these run inside
//an app somebody is using -- and it is why ./node.test.js checks that volume 0
//survives all the way into each platform's command, since the moment it stops
//doing so this suite starts talking.
//
//RATE 2 THROUGHOUT, for the same reason: every one of these waits for a real
//synthesizer to finish reading real words, and the suite is as slow as the words
//are long. Above 2 chromium stops being reliable, which is its own comment in
//./window.js.

plugin.consumes = ['selftest', 'tts'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var tts = imports.tts;

    var SILENT = { volume: 0, rate: 2 };

    describe('tts, in the window', function () {

        //VOICES ARRIVE LATE, ALWAYS: getVoices() answers [] on the first call in
        //every chromium build, and that call is what starts the fetch. This asks
        //the plugin, which waits for `voiceschanged` -- so a list here is proof
        //the waiting works, and an empty one is a machine with no backend rather
        //than the first-call bug.
        it('has a voice list by the time it is asked for one', async function () {
            var voices = await tts.voices();
            assert.ok(Array.isArray(voices), 'not a list');

            voices.forEach(function (v) {
                assert.equal(typeof v.name, 'string');
                assert.ok(v.name.length > 0, 'a voice with no name');
                assert.equal(typeof v.lang, 'string');
            });

            //and `able` is the same answer as a boolean, which is what a caller
            //deciding whether to draw a voice picker actually wants
            assert.equal(await tts.able(), voices.length > 0);
        });

        it('says nothing is an error rather than silence', async function () {
            var refused = null;
            try { await tts.speak(''); } catch (e) { refused = e; }
            assert.ok(refused, 'an empty string was accepted, so the page would just go quiet');
        });

        //CHROMIUM WILL NOT SPEAK IN A PAGE NOBODY HAS TOUCHED -- the autoplay
        //policy, since speech is audio. A window the suite opened and never
        //clicked is refused with `not-allowed`, by a voice getVoices() had just
        //listed. So what is pinned here is that speak() ANSWERS either way and
        //says which door it went through, rather than that the page spoke:
        //asserting `route: 'speech'` would pass or fail on whether somebody had
        //clicked the window before the suite ran.
        it('speaks, one way or the other, and says which', async function () {
            var out = await tts.speak('Testing.', SILENT);

            assert.ok(out.route === 'speech' || out.route === 'node', 'route: ' + out.route);
            assert.equal(out.parts, 1);

            //and a refusal is never silent about being one
            if (out.route === 'node') {
                assert.equal(out.why, 'not-allowed');
                assert.equal(out.touched, false, 'refused a page that HAD been touched, which is something else');
            }
        });

        //CHUNKING IS NOT COSMETIC. Chromium's local voices truncate somewhere
        //past 200 characters, so a paragraph handed over whole is a paragraph
        //cut off mid word -- and the caller is never told, because `end` fires
        //on the part that was spoken.
        it('reads a long text as the parts speech.js cut it into', async function () {
            var text = 'One. Two. Three three three. Four four four four.';
            var expected = speech.chunk(text, 30).length;

            assert.ok(expected > 1, 'the text did not chunk, so this proves nothing');

            var out = await tts.speak(text, { volume: 0, rate: 2, max: 30 });
            assert.equal(out.parts, expected, 'it answered ' + JSON.stringify(out));
        });

        //THE OTHER HALF, OVER THE SOCKET. This is the fallback a page with no
        //voices takes, and asking for it on purpose is the only way to exercise
        //it on a machine that has plenty -- otherwise the path that matters most
        //on a bare linux box is the one path never run.
        //
        //It is also the whole shape of this scaffold in one call: the same
        //service name, an implementation per side, and a page reaching the node
        //half over ../../app/core/io because `ipc` is not one of its services.
        it('can hand the sentence to the node half instead', async function () {
            var out = await tts.speak('Testing.', { via: 'node', volume: 0, rate: 2 });

            assert.equal(out.route, 'node', 'it spoke here rather than over there');
        });

        it('reports a failure from the node half rather than resolving', async function () {
            var failed = null;
            try { await tts.speak('   ', { via: 'node' }); } catch (e) { failed = e; }

            assert.ok(failed, 'saying nothing over the socket came back as done');
        });

        //A QUEUE LEFT RUNNING THROUGH A NAVIGATION WEDGES IT: the synthesizer
        //accepts utterances afterwards and speaks none of them until the app is
        //restarted. Webpack full-reloads this page whenever it cannot hot swap,
        //so this is not a rare case -- it is every other save.
        it('stop empties the queue and leaves it usable', async function () {
            var long = 'This is a long sentence that would take a while to read out loud. '.repeat(3);
            var speaking = tts.speak(long, { volume: 0, rate: 0.8 });

            await new Promise(function (r) { setTimeout(r, 200); });
            tts.stop();

            //cancel() fires neither `end` nor `error` for what it discards, so
            //`stop` settles the parked utterances itself -- without that this
            //await never returns, which is the bug this line is watching for
            var out = await speaking;

            assert.ok(out.stopped, 'it read the whole paragraph rather than stopping');
            assert.ok(!tts.speaking, 'still speaking after stop');

            //and the queue is not wedged: something else can still be said
            var after = await tts.speak('Again.', SILENT);
            assert.ok(after.route, 'nothing could be spoken after a stop');
        });
    });

    register();
}
module.exports = plugin;
