const { test } = require('node:test');
const assert = require('node:assert');

const keeping = require('./keeping');

//WHICH LINES ARE ACTS, ASKED WITHOUT AN APP.
//
//This is the half of the plugin most likely to be wrong, and it is a pure
//decision about a shape -- so it is answered here in a millisecond rather than
//by writing files inside a running app. Everything else in ./main.js is file
//handling.

function line(tags, text, level) {
    return { id: 1, at: Date.now(), level: level || 'info', tags: tags, text: text || 'something' };
}

//---- the rule -------------------------------------------------------------

test('an act with a tag the policy keeps is kept', () => {
    assert.equal(keeping.worthKeeping(line(['app'], 'started')), true);
    assert.equal(keeping.worthKeeping(line(['cron'], 'the beat threw')), true);
});

test('a line with no tag anybody asked for is not an act', () => {
    assert.equal(keeping.worthKeeping(line(['something-nobody-named'])), false);
    assert.equal(keeping.worthKeeping(line([])), false);
    assert.equal(keeping.worthKeeping(null), false);
});

//THE MEASURED BUG THIS ORDER EXISTS FOR.
//
//The app this came from asked its allowlist first and had a deny list it never
//reached: a socket entry carries several tags, and one kept tag let every one of
//them through. 89 of 400 rows were a single poll repeating itself, and the acts
//had scrolled out of the file.
test('a denied tag refuses the line even when a kept tag is also on it', () => {
    assert.equal(keeping.worthKeeping(line(['app', 'connection'])), false,
        'the deny list never fired, which is how a record fills up with weather');

    assert.equal(keeping.worthKeeping(line(['demo', 'tick'])), false);
    assert.equal(keeping.worthKeeping(line(['cron', 'ping', 'app'])), false);
});

//COMMAND OUTPUT IS A TRANSCRIPT, NOT AN ACT. `log.out` splits it into one entry
//per line, so a forty-line stack trace is forty rows saying nothing about what
//the app decided -- and it is the exact content the live log stays in memory for.
test('command output is never an act, whatever it is tagged', () => {
    assert.equal(keeping.worthKeeping(line(['app'], 'anything', 'out')), false);
    assert.equal(keeping.worthKeeping(line(['demo'], 'anything', 'out')), false);
});

//---- and it is the app's policy, not this file's --------------------------

test('an app can name its own vocabulary', () => {
    const mine = { keep: ['deploy'], never: ['noise'] };

    assert.equal(keeping.worthKeeping(line(['deploy'], 'shipped'), mine), true);
    assert.equal(keeping.worthKeeping(line(['deploy', 'noise']), mine), false);

    //and the defaults are gone, not merged -- a policy that quietly kept the
    //scaffold's tags as well would record things an app never asked for
    assert.equal(keeping.worthKeeping(line(['app'], 'started'), mine), false);
});

//---- what goes in a row ---------------------------------------------------

//A LOG ENTRY'S `id` COUNTS FROM 1 AND RESETS WITH THE PROCESS. Keeping it would
//be keeping a number that means something different in every row, next to a
//`seq` that does not.
test('a row carries the count and not the log id', () => {
    const out = keeping.row(line(['app'], 'started'), 7);

    assert.equal(out.seq, 7);
    assert.equal(out.id, undefined, 'the log id was kept, and it resets every restart');
    assert.equal(out.text, 'started');
    assert.equal(out.level, 'info');
});

//REDACTION AT THE BOUNDARY, which is the condition core/log set on any durable
//record existing at all. It uses the BLUNT profile, because what is written here
//is kept for ever.
test('a row is scrubbed on the way in, by the durable rules', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    const out = keeping.row(line(['app'], 'cloning with ' + token), 1);

    assert.equal(out.text.indexOf(token), -1, out.text);

    //and the blunt half: a sign-in url loses its tail, which is the case this
    //profile exists for -- the allowlist keeps `app`, so without it starting a
    //sign-in would put an authorize url on disk
    const url = keeping.scrub('open https://claude.ai/oauth/authorize?code=s3cret');

    assert.ok(url.indexOf('claude.ai') > 0, url);
    assert.equal(url.indexOf('s3cret'), -1, url);
});

//---- reading it back, which is what surviving a restart means -------------

//A COUNT THAT RESTARTS WITH THE PROCESS makes every bookmark taken before a
//restart point into the middle of the record rather than at the act it was taken
//from -- so a watcher comes back and is handed things it has already seen, or
//misses everything before its mark. The count is in the file for this reason
//alone.
test('a count already in the file is kept, not handed out again', () => {
    const text = [
        JSON.stringify({ seq: 41, at: 1, level: 'info', tags: ['app'], text: 'one' }),
        JSON.stringify({ seq: 42, at: 2, level: 'info', tags: ['app'], text: 'two' })
    ].join('\n');

    const back = keeping.read(text);

    assert.equal(back.rows.length, 2);
    assert.equal(back.rows[0].seq, 41, 'it renumbered rows that already had counts');
    assert.equal(back.rows[1].seq, 42);

    //and the next act carries on from the highest, rather than from 1
    assert.equal(back.last, 42, 'the count restarts with the process');
});

//ROWS FROM BEFORE THE COUNT EXISTED get one, in the order they are already in --
//otherwise a listing ending on an old row hands back a bookmark of null, and the
//next read starts from the beginning. Not wrong, but it reads as the record
//having forgotten where you were.
test('rows written before counts existed are numbered in place', () => {
    const text = [
        JSON.stringify({ at: 1, tags: ['app'], text: 'old' }),
        JSON.stringify({ at: 2, tags: ['app'], text: 'older' }),
        JSON.stringify({ seq: 9, at: 3, tags: ['app'], text: 'new' })
    ].join('\n');

    const back = keeping.read(text);

    assert.equal(back.rows[0].seq, 1);
    assert.equal(back.rows[1].seq, 2);
    assert.equal(back.rows[2].seq, 9, 'a row that had a count lost it');
    assert.equal(back.last, 9);
});

//A HALF-WRITTEN LAST LINE IS A PROCESS THAT WAS KILLED MID-WRITE, not a
//corrupted record. Throwing loses the lot, and from outside that is
//indistinguishable from the app never having kept anything.
test('a last line cut short costs one act, not the record', () => {
    const good = JSON.stringify({ seq: 1, at: 1, tags: ['app'], text: 'kept' });
    const back = keeping.read(good + '\n{"seq":2,"at":2,"tags":["app"],"te');

    assert.equal(back.rows.length, 1, 'the truncated line was not skipped');
    assert.equal(back.rows[0].text, 'kept');
});

test('an empty file, and no file at all, are both an empty record', () => {
    [' ', '', '\n\n', null, undefined].forEach((odd) => {
        const back = keeping.read(odd);

        assert.equal(back.rows.length, 0, JSON.stringify(odd) + ' produced rows');
        assert.equal(back.last, 0);
    });
});
