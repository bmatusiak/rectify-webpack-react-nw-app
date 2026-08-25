var speech = require('./speech');

//SPEAKING, FROM THE PAGE. The Web Speech API is here and needs no permission,
//no dependency and no process -- so this is the route to prefer, and ./server.js
//is the same service answered by the OS synthesizer for the half of the app that
//has no window.
//
//NW.JS HAS NO TTS OF ITS OWN. Three layers can speak and all three end at the
//same place -- SAPI on windows, AVSpeechSynthesizer on macos, speech-dispatcher
//on linux. `chrome.tts` is the third and this does not use it: it needs a
//"permissions" entry in package.json, it hands back the same OS voice pool this
//one already has, and its callback API would be wrapped back into promises here
//anyway. Nothing is gained by asking the same synthesizer through a second door.
//
//WHAT IS ACTUALLY HARD ABOUT THIS is none of the above -- see the three
//comments below. All three are the kind of bug that looks like a broken machine.

plugin.consumes = ['io', 'Plugin'];
plugin.provides = ['tts'];
async function plugin(imports, register, config) {
    config = config || {};

    var io = imports.io;
    var self = new imports.Plugin('tts');

    var synth = typeof window != 'undefined' && window.speechSynthesis;
    var Utterance = typeof window != 'undefined' && window.SpeechSynthesisUtterance;

    //THE UTTERANCE IS HELD ONLY WEAKLY BY THE QUEUE, so an utterance that is a
    //local variable can be collected while it is still being spoken: the audio
    //stops mid sentence and `end` never fires, so anything awaiting it waits
    //forever. Parking them here until they finish is the whole fix, and it is
    //the reason this file has a Set in it at all.
    //
    //Each entry carries its own `settle` for the second reason below: cancel()
    //fires neither `end` nor `error` for what it discards, so a promise waiting
    //on a cancelled utterance would never settle and the loop in speak() would
    //wait on it forever.
    var inFlight = new Set();

    //AND STOPPING IS A NUMBER, NOT A SIGNAL. A paragraph is several utterances
    //spoken one after another, so emptying the queue stops the sentence and the
    //loop starts the next one -- the node half had exactly the same bug, where
    //killing the child left eleven seconds of paragraph still to come. Every
    //speak() takes the count it started under and gives up when it changes.
    var generation = 0;

    //ASKED ONCE AND REMEMBERED. The waiting itself is ./speech.js's, where a
    //fake can be made to answer late -- in a window that has been open a minute
    //the first getVoices() already answers, so believing it and waiting for it
    //look exactly alike, and a sabotage that deleted the waiting passed every
    //test in this app.
    var VOICE_WAIT = config.voiceWait || 3000;
    var loaded = null;

    function voices() {
        if (!loaded) loaded = speech.loadVoices(synth, VOICE_WAIT);
        return loaded;
    }

    function named(list, want) {
        if (!want) return null;
        return list.filter(function (v) { return v.name === want || v.lang === want; })[0] || null;
    }

    function say(part, opts, chosen) {
        return new Promise(function (resolve, reject) {
            var utter = new Utterance(part);

            if (chosen) {
                utter.voice = chosen;

                //THE VOICE OBJECT ALONE IS NOT ENOUGH on some platforms -- they
                //read `lang` and ignore `voice`, and the result is the right
                //words in the wrong accent, which reads as the voice picker
                //being broken rather than this line being missing.
                utter.lang = chosen.lang;
            }

            utter.rate = opts.rate === undefined ? 1 : opts.rate;
            utter.pitch = opts.pitch === undefined ? 1 : opts.pitch;
            utter.volume = opts.volume === undefined ? 1 : opts.volume;

            if (typeof opts.onBoundary == 'function') utter.addEventListener('boundary', opts.onBoundary);

            var entry = { utter: utter, settle: function () { done(resolve, { stopped: true }); } };

            function done(fn, value) {
                inFlight.delete(entry);
                fn(value);
            }

            utter.addEventListener('end', function () { done(resolve, {}); });
            utter.addEventListener('error', function (e) {
                //THE REASON IS THE INTERESTING PART, not the message. `not-allowed`
                //is chromium refusing to speak at all rather than anything about
                //this utterance, and speak() below routes around it -- so it is
                //carried on the error instead of being flattened into text.
                done(reject, Object.assign(
                    new Error((e && e.error) || 'the voice stopped'),
                    { reason: e && e.error }));
            });

            inFlight.add(entry);
            synth.speak(utter);
        });
    }

    //THE NODE HALF, ASKED OVER THE SOCKET. This is the fallback when the page
    //has no voices at all -- a linux box with no speech-dispatcher backend is
    //the usual reason -- and it is also `via: 'node'` for a caller that wants
    //the OS synthesizer on purpose.
    //
    //It is an emit with an ack rather than anything cleverer because that is
    //what a page has: `ipc` is main, server and cli, and the window is not one
    //of them. ../../app/remote does the same in the other direction.
    function overSocket(text, opts) {
        return new Promise(function (resolve, reject) {
            var settled = false;

            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error('the node half did not answer in time'));
            }, opts.timeout || 30000);

            io.emit('tts:speak', { text: text, opts: opts }, function (reply) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                if (reply && reply.error) return reject(new Error(reply.error));
                resolve(reply || {});
            });
        });
    }

    async function speak(text, opts) {
        opts = opts || {};
        text = String(text === undefined || text === null ? '' : text);

        //NOTHING TO SAY IS AN ERROR RATHER THAN A NO-OP. A speak() that resolves
        //on empty text hides the bug where the caller's variable was undefined,
        //and the app goes quiet with nothing in the log.
        if (!text.trim()) throw new Error('there is nothing to say');

        var available = await voices();
        var route = opts.via || (available.length ? 'speech' : 'node');

        if (route === 'node') {
            var reply = await overSocket(text, opts);
            return { route: 'node', parts: reply.parts || 1, stopped: !!reply.stopped };
        }

        if (!synth || !Utterance) throw new Error('this window has no speech synthesis');

        //ONE THING SPEAKING AT A TIME, unless asked otherwise. The queue is FIFO
        //and appending is easy, but two callers each queueing a paragraph
        //produces one long interleaved-sounding read that neither of them asked
        //for. `enqueue: true` is how a caller says it meant to line up.
        //locally only -- see stop(): the node half supersedes itself
        if (!opts.enqueue) stop(false);
        var mine = generation;

        var chosen = named(available, opts.voice);
        var parts = speech.chunk(text, opts.max);
        var spoken = 0;

        for (var at = 0; at < parts.length; at++) {
            if (mine !== generation) break;

            try {
                await say(parts[at], opts, chosen);
            } catch (e) {
                //CHROMIUM WILL NOT SPEAK IN A PAGE NOBODY HAS TOUCHED -- the
                //autoplay policy, since speech is audio. It arrives as
                //`not-allowed` from a voice getVoices() had just listed, which
                //reads as a broken synthesizer rather than a refused one.
                //Measured both ways: a window the suite opened and never clicked
                //cannot speak a word, and the same window can once it is clicked.
                //
                //WHEN a refusal is worth handing to the node half is
                //./speech.js's, because a page somebody has clicked never
                //reaches this line -- so a test for it written here is a test
                //that cannot fail.
                if (!speech.fallsBack(e, spoken, opts.via)) throw e;

                var handed = await overSocket(text, opts);
                return {
                    route: 'node', parts: handed.parts || 1, stopped: !!handed.stopped,
                    why: 'not-allowed', touched: touched()
                };
            }

            spoken++;
        }

        //STOPPED IS NOT FAILED, the same as the node half: whoever called stop()
        //knows why it went quiet, so the answer says how much was said.
        return { route: 'speech', parts: spoken, stopped: mine !== generation };
    }

    //EVIDENCE RATHER THAN A GUESS about why `not-allowed` happened. A refusal
    //with `touched: false` beside it is the autoplay policy; one with
    //`touched: true` is something else, and the difference is the first thing
    //anybody would want to know.
    function touched() {
        return !!(typeof navigator != 'undefined' && navigator.userActivation &&
            navigator.userActivation.hasBeenActive);
    }

    //TWO REASONS TO STOP, AND ONLY ONE OF THEM CROSSES THE SOCKET.
    //
    //When speak() handed the text to the node half -- no voices here, or
    //chromium refusing a page nobody has touched -- cancelling the local queue
    //stops nothing at all, so `tts.stop()` has to say so over there too.
    //
    //But a NEW speak() also stops the old one, and telling the far side that is
    //both unnecessary and wrong: it supersedes itself the same way, and the stop
    //raced the request that followed it -- the node half took the message mid
    //paragraph and came back `{ parts: 1, stopped: true }` for a two part text.
    //Measured, from a test that asked for two and was told one.
    function stop(alsoOverThere) {
        generation++;

        if (alsoOverThere) {
            //fire and forget: there is nothing to wait for, and nothing to say
            //if it does not arrive
            try { io.emit('tts:stop'); } catch (e) { /* the socket is not up yet */ }
        }

        //`cancel` fires neither `end` nor `error` for what it discards, so
        //anything waiting on a cancelled utterance is settled here or never
        var waiting = Array.from(inFlight);
        inFlight.clear();

        if (synth) synth.cancel();
        waiting.forEach(function (entry) { entry.settle(); });
    }

    //A QUEUE LEFT RUNNING THROUGH A NAVIGATION WEDGES IT. Webpack full-reloads
    //this page whenever it cannot hot swap, and a reload with speech in flight
    //came back with a synthesizer that accepted utterances and spoke none of
    //them until the app was restarted. Cancelling on the way out is the fix.
    function leaving() { stop(true); }

    if (typeof window != 'undefined') {
        window.addEventListener('beforeunload', leaving);
        self.own(function () { window.removeEventListener('beforeunload', leaving); });
    }

    self.own(function () { stop(true); });

    await register(null, {
        tts: self.api({
            speak: speak,

            //asked for out loud, so it reaches whichever half is speaking
            stop: function () { return stop(true); },
            pause: function () { if (synth) synth.pause(); },
            resume: function () { if (synth) synth.resume(); },

            //the list as plain objects, so a caller does not have to know what a
            //SpeechSynthesisVoice is to put one in a <select>
            voices: async function () {
                return (await voices()).map(function (v) {
                    return { name: v.name, lang: v.lang, local: v.localService, default: v.default };
                });
            },

            //WHETHER THIS WINDOW CAN SPEAK FOR ITSELF, which is not the same as
            //whether the app can: with no voices here `speak` still works, over
            //the socket, and a caller wanting to say so on screen needs the
            //difference rather than a boolean that hides it.
            get speaking() { return !!(synth && synth.speaking); },
            able: async function () { return (await voices()).length > 0; },

            //whether this page has been touched, which is what decides if it may
            //speak for itself at all -- see the `not-allowed` comment in speak()
            get touched() { return touched(); }
        }),
        onDestroy: self.unload
    });
}
module.exports = plugin;
