const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Drawers = require('./drawers');

//THE THREE DOORS, ASKED WITHOUT AN APP.
//
//All of this is a rule about keys, and a rule about keys is the thing a cache
//gets wrong -- so it is answered here rather than inside a running app. The
//clock is an argument for the same reason ../cron's is: the only other way to
//test a window is to wait for one, and a test that waits is slow when it passes
//and flaky when it does not.

function ticking(start) {
    let now = start || 1000;
    const clock = () => now;
    clock.pass = (ms) => { now += ms; };
    return clock;
}

//---- what a drawer is for -------------------------------------------------

test('an answer is worked out once and handed back after that', async () => {
    let ran = 0;
    const drawers = Drawers();
    const one = drawers.byContent('probe');

    const make = async () => { ran++; return 'worked out'; };

    assert.equal(await one.get('a-sha', make), 'worked out');
    assert.equal(await one.get('a-sha', make), 'worked out');
    assert.equal(ran, 1, 'it ran the expensive thing ' + ran + ' times');

    const stats = drawers.stats();
    assert.equal(stats.miss, 1);
    assert.equal(stats.hit, 1);
});

test('a different key is a different answer', async () => {
    const one = Drawers().byContent('probe');

    assert.equal(await one.get('sha-a', async () => 'a'), 'a');
    assert.equal(await one.get('sha-b', async () => 'b'), 'b');
    assert.equal(await one.get('sha-a', async () => 'never'), 'a');
});

//TWO CALLERS WANTING THE SAME KEY AT THE SAME MOMENT is the ordinary case when
//a page draws. Without this the expensive thing runs twice and both callers wait
//for their own copy of it.
test('concurrent askers share one computation', async () => {
    let ran = 0;
    const drawers = Drawers();
    const one = drawers.byContent('probe');

    const slow = () => new Promise((r) => setTimeout(() => { ran++; r('once'); }, 20));

    const [a, b, c] = await Promise.all([
        one.get('same', slow), one.get('same', slow), one.get('same', slow)
    ]);

    assert.equal(a, 'once'); assert.equal(b, 'once'); assert.equal(c, 'once');
    assert.equal(ran, 1, 'the expensive thing ran ' + ran + ' times');
    assert.equal(drawers.stats().share, 2, 'they did not share');
});

//A FAILURE IS NOT AN ANSWER. Remembering a thrown error would make one bad
//moment permanent, and the caller would have no way to ask again.
test('a computation that throws is not remembered', async () => {
    const one = Drawers().byContent('probe');

    await assert.rejects(() => one.get('k', async () => { throw new Error('no'); }));

    assert.equal(await one.get('k', async () => 'worked this time'), 'worked this time');
});

//---- byStamp: the key is the file, and the drawer does the stamping --------

test('a file that changes is a different key', async () => {
    const file = path.join(os.tmpdir(), 'cached-probe-' + process.pid + '.txt');
    const one = Drawers().byStamp('probe');

    try {
        fs.writeFileSync(file, 'first');
        assert.equal(await one.get(file, async () => 'answer one'), 'answer one');
        assert.equal(await one.get(file, async () => 'never'), 'answer one');

        //LONGER, so the stamp differs even where mtime has a coarse resolution
        //-- which is exactly why size is in the stamp
        fs.writeFileSync(file, 'second, and longer than the first');
        assert.equal(await one.get(file, async () => 'answer two'), 'answer two',
            'the file changed and the old answer came back');
    } finally {
        try { fs.unlinkSync(file); } catch (e) { /* gone */ }
    }
});

//"THERE IS NO SUCH FILE" IS A PERFECTLY GOOD THING TO REMEMBER, and it changes
//the moment somebody creates one -- so it is a stamp rather than a throw.
test('a file that is not there has a stamp of its own', async () => {
    const file = path.join(os.tmpdir(), 'cached-absent-' + process.pid + '.txt');
    const one = Drawers().byStamp('probe');

    assert.equal(await one.get(file, async () => 'nothing there'), 'nothing there');

    try {
        fs.writeFileSync(file, 'now it exists');
        assert.equal(await one.get(file, async () => 'now it does'), 'now it does',
            'creating the file did not change the key');
    } finally {
        try { fs.unlinkSync(file); } catch (e) { /* gone */ }
    }
});

//---- whileFresh: the door that breaks the rule, on purpose ----------------

test('a clock-keyed answer stops being used when its window passes', async () => {
    const clock = ticking();
    const one = Drawers({ now: clock }).whileFresh('probe', 1000);

    assert.equal(await one.get('k', async () => 'first'), 'first');

    clock.pass(500);
    assert.equal(await one.get('k', async () => 'second'), 'first', 'it expired early');

    clock.pass(600);
    assert.equal(await one.get('k', async () => 'third'), 'third', 'it never expired');
});

//IT MUST BE DROPPED WHEN SOMETHING WRITES, which is the whole of what makes this
//door honest rather than a guess with a timer on it.
test('stale() drops the clock-keyed answers', async () => {
    const drawers = Drawers();
    const fresh = drawers.whileFresh('probe', 60000);

    await fresh.get('k', async () => 'before the write');
    assert.equal(drawers.stale(), 1, 'it dropped nothing');
    assert.equal(await fresh.get('k', async () => 'after the write'), 'after the write');
});

//AND LEAVES THE OTHER TWO ALONE, which is the point rather than an oversight: a
//content-keyed answer cannot be wrong, and a stamp-keyed one notices on its own.
//Wiping those on every write throws away exactly the answers that are still true.
test('stale() leaves content- and stamp-keyed answers where they are', async () => {
    const drawers = Drawers();
    const content = drawers.byContent('probe-content');

    await content.get('a-sha', async () => 'true for ever');
    drawers.stale();

    assert.equal(await content.get('a-sha', async () => 'recomputed'), 'true for ever',
        'a write threw away an answer that could not have been wrong');
});

//---- the wipe -------------------------------------------------------------

//A WIPE RATHER THAN AN LRU: nothing here is expensive to work out ONCE, and a
//cache that needs a data structure to decide what to forget has stopped being
//the cheap thing it was supposed to be.
test('a full drawer drops the lot rather than choosing a victim', async () => {
    const drawers = Drawers({ keep: 4 });
    const one = drawers.byContent('probe');

    for (let i = 0; i < 5; i++) await one.get('k' + i, async () => i);

    assert.ok(one.size <= 4, 'it kept ' + one.size + ' with a limit of 4');
    assert.equal(drawers.stats().wiped, 1);
});

//---- what may be written down ---------------------------------------------

//THE RULE THAT MATTERS MOST HERE. What a byStamp drawer holds is derived from a
//file, and that file may be a sealed credential -- a persisted copy of an
//unsealed secret is a worse bug than every call the cache saves.
test('only a content-keyed drawer is ever written down', async () => {
    const written = {};
    const drawers = Drawers({ save: (name, pairs) => { written[name] = pairs; } });

    await drawers.byContent('safe').get('a-sha', async () => 'true for ever');
    await drawers.byStamp('derived').get(__filename, async () => 'from a file');
    await drawers.whileFresh('guessed').get('k', async () => 'for a moment');

    assert.ok(written.safe && written.safe.length === 1, 'the content drawer was not written');
    assert.equal(written.derived, undefined, 'a stamp-keyed drawer reached disk');
    assert.equal(written.guessed, undefined, 'a clock-keyed drawer reached disk');
});

test('a content-keyed drawer is read back, and the others start empty', async () => {
    let ran = 0;

    const drawers = Drawers({ load: (name) => (name === 'warm' ? [['a-sha', 'from disk']] : null) });
    const one = drawers.byContent('warm');

    assert.equal(await one.get('a-sha', async () => { ran++; return 'worked out'; }), 'from disk');
    assert.equal(ran, 0, 'it recomputed something it had been handed');
});

//ABSENT IS A REAL ANSWER, not a failure: every drawer still works and starts
//empty on every start, which is a cache behaving like a cache.
test('with nowhere to write, it still works and says so', async () => {
    const drawers = Drawers();

    assert.equal(drawers.persists, false);
    assert.equal(await drawers.byContent('probe').get('k', async () => 'fine'), 'fine');

    assert.equal(Drawers({ save: () => { } }).persists, true);
});

//WHY SIZE IS IN THE STAMP, forced rather than hoped for.
//
//mtime HAS A RESOLUTION, and two writes inside one tick is the case it misses.
//Writing twice in a row usually lands in different milliseconds, so a stamp of
//mtime ALONE passes that test and is still wrong -- which is exactly what
//happened: this drawer's sabotage survived until the mtime was pinned by hand.
test('a file rewritten with the same timestamp is still a different key', async () => {
    const file = path.join(os.tmpdir(), 'cached-stamp-' + process.pid + '.txt');
    const one = Drawers().byStamp('probe');

    //one fixed instant, so the ONLY thing that differs is the length
    const when = new Date(1700000000000);

    try {
        fs.writeFileSync(file, 'a');
        fs.utimesSync(file, when, when);
        assert.equal(await one.get(file, async () => 'answer one'), 'answer one');

        fs.writeFileSync(file, 'ab');
        fs.utimesSync(file, when, when);

        assert.equal(await one.get(file, async () => 'answer two'), 'answer two',
            'the file changed and the stamp did not notice');
    } finally {
        try { fs.unlinkSync(file); } catch (e) { /* gone */ }
    }
});
