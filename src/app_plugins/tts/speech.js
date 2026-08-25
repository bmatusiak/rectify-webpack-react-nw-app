//The parts of speaking that are only text and arguments.
//
//BOTH HALVES REQUIRE THIS, which is why it spawns nothing and touches no DOM.
//./window.js runs in the browser and ./server.js in node, and the two agree
//about where a sentence ends and what `rate: 1.5` means -- an agreement that
//would otherwise be written twice and drift the first time one was tuned.
//
//It is also what makes this plugin testable without making a sound. ./node.test.js
//asks these functions everything that matters and never opens an audio device;
//a suite that speaks is a suite nobody runs twice.

//WHERE A SENTENCE ENDS, and 180 characters is not arbitrary. Chromium's local
//voices truncate somewhere around 200-250 characters per utterance, and long
//speech stalls near fifteen seconds -- so text is cut at a boundary a listener
//already expects a pause at, and queued.
//
//THE OTHER FIX IS A WATCHDOG: pause() and resume() on a ten second interval,
//which is what most of the web does. It works and it fights the queue -- every
//tick races whatever the queue is doing, and pausing a queue that has just
//emptied wedges it. Cutting the text up front means nothing has to be nudged.
var MAX = 180;

module.exports.MAX = MAX;

module.exports.chunk = function chunk(text, max) {
    max = max || MAX;

    var parts = [];
    var buffer = '';

    //split AFTER the punctuation rather than on it, so the full stop stays with
    //the sentence it ended -- a voice reads "done" and "done." differently
    String(text).split(/(?<=[.!?;:])\s+/).forEach(function (sentence) {
        if ((buffer + ' ' + sentence).trim().length > max) {
            if (buffer) parts.push(buffer.trim());
            buffer = sentence;
        } else {
            buffer = (buffer + ' ' + sentence).trim();
        }
    });

    if (buffer) parts.push(buffer.trim());

    //A SENTENCE LONGER THAN THE LIMIT IS STILL ONE PART, on purpose. Cutting mid
    //word to satisfy a number invented here would make the voice stumble over
    //something the punctuation never asked it to.
    return parts;
};

//THE TEXT IS NEVER PART OF THE COMMAND.
//
//`powershell -Command "$s.Speak('" + text + "')"` is the obvious way to do this
//and it is a hole: a quote or a `;` in whatever the app is reading aloud ends
//the string and starts a statement. The text goes in the ENVIRONMENT on windows
//and after a bare `--` everywhere else, so there is no parser between the app
//and the synthesizer that could mistake it for an instruction.
var POWERSHELL = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'if ($env:TTS_VOICE) { $s.SelectVoice($env:TTS_VOICE) }',
    '$s.Rate = [int]$env:TTS_RATE',
    '$s.Volume = [int]$env:TTS_VOLUME',
    'if ($env:TTS_FILE) { $s.SetOutputToWaveFile($env:TTS_FILE) }',
    '$s.Speak($env:TTS_TEXT)',
    '$s.Dispose()'
].join('; ');

module.exports.POWERSHELL = POWERSHELL;

//RATE IS 1 = NORMAL HERE, because that is what the Web Speech API means by it
//and this plugin has one vocabulary. Each synthesizer wants its own number:
//SAPI counts in steps from -10 to 10, `say` and espeak in words per minute.
function paced(rate, platform) {
    if (platform === 'win32') return Math.max(-10, Math.min(10, Math.round((rate - 1) * 10)));
    if (platform === 'darwin') return Math.round(180 * rate);
    return Math.round(175 * rate);
}

module.exports.paced = paced;

//What to run to say something. `platform` is an argument rather than read from
//`process` so all three answers can be asked for on one machine -- the other
//two are the ones nobody would otherwise notice breaking.
module.exports.command = function command(text, opts, platform) {
    opts = opts || {};
    platform = platform || process.platform;

    var rate = opts.rate === undefined ? 1 : Number(opts.rate);
    var volume = opts.volume === undefined ? 1 : Number(opts.volume);
    var pace = paced(rate, platform);

    if (platform === 'win32') {
        return {
            cmd: 'powershell',
            args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL],
            env: {
                TTS_TEXT: String(text),
                TTS_VOICE: opts.voice || '',
                TTS_RATE: String(pace),
                TTS_VOLUME: String(Math.round(volume * 100)),
                TTS_FILE: opts.file || ''
            }
        };
    }

    if (platform === 'darwin') {
        var say = [];
        if (opts.voice) say.push('-v', opts.voice);
        say.push('-r', String(pace));
        if (opts.file) say.push('-o', opts.file);

        //`say` HAS NO VOLUME FLAG. The inline command is the documented way, and
        //it is part of the TEXT rather than an argument -- which is safe only
        //because it is prepended here, to text that arrives after `--`.
        say.push('--', (volume === 1 ? '' : '[[volm ' + volume.toFixed(2) + ']] ') + String(text));
        return { cmd: 'say', args: say, env: {} };
    }

    var espeak = ['-s', String(pace), '-a', String(Math.round(volume * 100))];
    if (opts.voice) espeak.push('-v', opts.voice);
    if (opts.file) espeak.push('-w', opts.file);
    espeak.push('--', String(text));

    return { cmd: 'espeak-ng', args: espeak, env: {}, then: 'espeak' };
};

//AND WHAT TO RUN TO ASK WHAT VOICES THERE ARE. Worth having as its own command
//because it is the one thing the node route can be asked that makes no sound --
//which is how ./server.test.js checks the route end to end inside a running app
//without anybody hearing it.
module.exports.voicesCommand = function voicesCommand(platform) {
    platform = platform || process.platform;

    if (platform === 'win32') {
        return {
            cmd: 'powershell',
            args: ['-NoProfile', '-NonInteractive', '-Command',
                'Add-Type -AssemblyName System.Speech; ' +
                '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ' +
                '% { $_.VoiceInfo.Name }'],
            env: {}
        };
    }

    if (platform === 'darwin') return { cmd: 'say', args: ['-v', '?'], env: {} };
    return { cmd: 'espeak-ng', args: ['--voices'], env: {}, then: 'espeak' };
};

//`say -v ?` and `espeak --voices` answer in columns; powershell answers one per
//line. All three become the same list of names, because a caller choosing a
//voice should not have to know which synthesizer it came from.
module.exports.voicesFrom = function voicesFrom(output, platform) {
    platform = platform || process.platform;

    var lines = String(output).split(/\r?\n/).map(function (line) { return line.trim(); })
        .filter(Boolean);

    if (platform === 'win32') return lines;

    if (platform === 'darwin') {
        //  Alex                en_US    # Most people recognize me by my voice.
        return lines.map(function (line) { return line.split(/\s{2,}|\s+(?=[a-z]{2}_)/)[0].trim(); })
            .filter(Boolean);
    }

    //espeak: "Pty Language Age/Gender VoiceName File Other Languages"
    return lines.slice(1).map(function (line) { return line.split(/\s+/)[3]; }).filter(Boolean);
};

//---- the two rules that only bite in a state a running app cannot be put in ----

//VOICES ARRIVE LATE, ALWAYS. getVoices() answers [] on the first call in every
//chromium build -- that call is what starts the fetch. Believing it is how an
//app decides it has no voices half a second before it gets some.
//
//`voiceschanged` may also have fired before the caller got here, so the list is
//checked first; and it may never fire at all, which is what the wait is for. An
//empty list AFTER that is a real answer: no backend.
//
//THE SYNTHESIZER IS AN ARGUMENT, and that is the whole point of this living
//here. In a window that has been open a minute the first call already answers,
//so believing it and waiting for it look identical -- a sabotage that removed
//the waiting passed every test in the app. A fake that answers [] and fires
//later is the only way to tell them apart, and it cannot be built in a browser
//that has already loaded its voices.
module.exports.loadVoices = function loadVoices(synth, wait) {
    return new Promise(function (resolve) {
        if (!synth) return resolve([]);

        var ready = synth.getVoices();
        if (ready.length) return resolve(ready);

        var timer = setTimeout(done, wait || 3000);

        function done() {
            clearTimeout(timer);
            synth.removeEventListener('voiceschanged', done);
            resolve(synth.getVoices());
        }

        synth.addEventListener('voiceschanged', done);
    });
};

//AND WHETHER A REFUSAL IS ONE TO HAND TO THE OTHER HALF.
//
//`not-allowed` is chromium refusing to speak at all -- the autoplay policy,
//since speech is audio -- rather than anything about this utterance. The node
//half is under no such rule and is the same synthesizer, so it can say what the
//page was not allowed to.
//
//Only before anything has been said, or a paragraph would start again from the
//top; and never when the caller named a route, or `via: 'speech'` would quietly
//become `via: 'node'`.
//
//Here rather than in ./window.js for the same reason as above: a page somebody
//has clicked never takes this branch, so in a running app the test for it is
//unfalsifiable. As a function it is a truth table.
module.exports.fallsBack = function fallsBack(error, spoken, via) {
    return !!(error && error.reason === 'not-allowed') && !spoken && !via;
};
