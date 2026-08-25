const { test } = require('node:test');
const assert = require('node:assert');

const speech = require('./speech');

//THE PARTS OF SPEAKING THAT MAKE NO SOUND, which is nearly all of the parts
//that can be wrong. ./speech.js spawns nothing and touches no DOM, so every
//question here is answered in this process in a millisecond -- and the two
//platforms this machine is not can be asked as easily as the one it is.
//
//./window.test.js and ./server.test.js run inside the app and are about the
//routes themselves. Between them and this, nothing in the plugin is checked by
//listening to it.

//---- chunking ------------------------------------------------------------

test('short text is one part', () => {
    assert.deepEqual(speech.chunk('Hello.'), ['Hello.']);
});

test('a sentence is not cut in half', () => {
    const text = 'One. ' + 'Two two two. '.repeat(20) + 'Three.';
    const parts = speech.chunk(text);

    assert.ok(parts.length > 1, 'nothing was split at all');
    parts.forEach((part) => {
        assert.ok(part.length <= speech.MAX + 20, 'a part ran long: ' + part.length);
        assert.ok(/[.!?;:]$/.test(part), 'a part ended mid sentence: ' + JSON.stringify(part.slice(-40)));
    });
});

test('the words all survive, in order', () => {
    const text = 'Alpha bravo. Charlie delta echo. ' + 'Foxtrot golf hotel india juliet. '.repeat(12);
    const parts = speech.chunk(text);

    assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

//A SENTENCE LONGER THAN THE LIMIT IS STILL ONE PART. Cutting mid word to
//satisfy a number this file invented would make the voice stumble over
//something the punctuation never asked it to.
test('one very long sentence is left alone rather than cut mid word', () => {
    const runOn = 'word '.repeat(120).trim() + '.';
    const parts = speech.chunk(runOn);

    assert.equal(parts.length, 1);
    assert.ok(!/word wo$|wor$/.test(parts[0]), 'a word was cut');
});

test('nothing in, nothing out', () => {
    assert.deepEqual(speech.chunk(''), []);
    assert.deepEqual(speech.chunk('   '), []);
});

//---- the command, on all three platforms ---------------------------------

//THE TEXT IS NEVER PART OF THE COMMAND, and this is the test that says so. A
//quote or a semicolon in what the app is reading aloud must not be able to
//become an instruction -- so it goes in the environment on windows and after a
//bare `--` everywhere else, and this checks both by trying it.
const NASTY = 'Done"; Remove-Item C:\\ -Recurse; "';

test('text with quotes and semicolons never lands in the command line', () => {
    const win = speech.command(NASTY, {}, 'win32');
    assert.equal(win.env.TTS_TEXT, NASTY);
    win.args.forEach((arg) => {
        assert.ok(arg.indexOf('Remove-Item') < 0, 'the text got into an argument: ' + arg);
    });

    ['darwin', 'linux'].forEach((platform) => {
        const spec = speech.command(NASTY, {}, platform);
        const at = spec.args.indexOf('--');

        assert.ok(at >= 0, platform + ' has no -- before the text');
        assert.equal(spec.args[at + 1], NASTY, platform + ' did not put the text last');
        assert.equal(spec.args.slice(at + 1).length, 1, platform + ' put something after the text');
    });
});

test('every platform gets a command it could actually run', () => {
    assert.equal(speech.command('hi', {}, 'win32').cmd, 'powershell');
    assert.equal(speech.command('hi', {}, 'darwin').cmd, 'say');
    assert.equal(speech.command('hi', {}, 'linux').cmd, 'espeak-ng');

    //and the linux one names the older binary to try if that is missing
    assert.equal(speech.command('hi', {}, 'linux').then, 'espeak');
});

//RATE IS 1 = NORMAL HERE, because that is what the Web Speech API means and
//this plugin has one vocabulary. Each synthesizer counts differently, and
//getting the arithmetic backwards is silent: the voice simply reads wrong.
test('rate 1 is normal on every platform', () => {
    assert.equal(speech.paced(1, 'win32'), 0, 'SAPI counts in steps either side of 0');
    assert.equal(speech.paced(1, 'darwin'), 180, 'say counts in words per minute');
    assert.equal(speech.paced(1, 'linux'), 175);
});

test('faster is a bigger number everywhere, and the clamp holds', () => {
    ['win32', 'darwin', 'linux'].forEach((platform) => {
        assert.ok(speech.paced(1.5, platform) > speech.paced(1, platform), platform + ' got slower');
        assert.ok(speech.paced(0.5, platform) < speech.paced(1, platform), platform + ' got faster');
    });

    //SAPI's range is -10 to 10 and it does not clamp for you: a Rate of 40
    //throws, from a line of powershell, reported as an exit code
    assert.equal(speech.paced(10, 'win32'), 10);
    assert.equal(speech.paced(-10, 'win32'), -10);
});

test('a voice and a file reach the command that would use them', () => {
    const win = speech.command('hi', { voice: 'Microsoft Zira Desktop', file: 'out.wav' }, 'win32');
    assert.equal(win.env.TTS_VOICE, 'Microsoft Zira Desktop');
    assert.equal(win.env.TTS_FILE, 'out.wav');

    const mac = speech.command('hi', { voice: 'Alex', file: 'out.aiff' }, 'darwin');
    assert.ok(mac.args.indexOf('Alex') > mac.args.indexOf('-v'));
    assert.ok(mac.args.indexOf('out.aiff') > mac.args.indexOf('-o'));

    const linux = speech.command('hi', { voice: 'en-gb', file: 'out.wav' }, 'linux');
    assert.ok(linux.args.indexOf('en-gb') > linux.args.indexOf('-v'));
    assert.ok(linux.args.indexOf('out.wav') > linux.args.indexOf('-w'));
});

//VOLUME 0 IS HOW THE OTHER TWO SUITES SPEAK WITHOUT BEING HEARD, so it has to
//actually reach the synthesizer on every platform or those tests are noise.
test('volume 0 is expressible on all three', () => {
    assert.equal(speech.command('hi', { volume: 0 }, 'win32').env.TTS_VOLUME, '0');
    assert.ok(speech.command('hi', { volume: 0 }, 'darwin').args.join(' ').indexOf('[[volm 0.00]]') >= 0);
    assert.ok(speech.command('hi', { volume: 0 }, 'linux').args.indexOf('0') > 0);

    //and a normal volume adds nothing to the macos text, so the ordinary case
    //is not carrying a marker a listener could hear read out
    assert.ok(speech.command('hi', {}, 'darwin').args.join(' ').indexOf('volm') < 0);
});

//---- reading a voice list back -------------------------------------------

test('three synthesizers, one list of names', () => {
    assert.deepEqual(
        speech.voicesFrom('Microsoft David Desktop\r\nMicrosoft Zira Desktop\r\n', 'win32'),
        ['Microsoft David Desktop', 'Microsoft Zira Desktop']);

    assert.deepEqual(
        speech.voicesFrom('Alex                en_US    # Most people know me.\nDaniel              en_GB    # Hello.\n', 'darwin'),
        ['Alex', 'Daniel']);

    assert.deepEqual(
        speech.voicesFrom([
            'Pty Language Age/Gender VoiceName          File                 Other Languages',
            ' 5  en-gb          --/M  english           gmw/en',
            ' 5  en-us          --/M  english-us        gmw/en-US'
        ].join('\n'), 'linux'),
        ['english', 'english-us']);
});

test('no voices reads as no voices rather than one blank one', () => {
    ['win32', 'darwin', 'linux'].forEach((platform) => {
        assert.deepEqual(speech.voicesFrom('', platform), [], platform);
        assert.deepEqual(speech.voicesFrom('\r\n\r\n', platform), [], platform);
    });
});
