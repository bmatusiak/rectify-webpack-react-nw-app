const { test } = require('node:test');
const assert = require('node:assert');

const makeSchedule = require('./schedule');

//THE SCHEDULE, WITHOUT WAITING FOR ANY OF IT.
//
//`now` is an argument to everything here, so a job that runs daily is as
//testable as one that runs every second -- and this whole file answers in a
//millisecond. That is the entire reason the clock lives in ./main.js and the
//arithmetic lives in ./schedule.js.

const T = 1000000;//an arbitrary fixed "now", so nothing here reads the real clock

function schedule() { return makeSchedule({}); }

//---- when a thing is due -------------------------------------------------

//A JOB ADDED AS RUNNING IS NOT INSTANTLY OVERDUE. Counting from zero would make
//every job in the app due the moment it registered, and they would all fire at
//once on the first beat.
test('a new job waits out its first interval', () => {
    const s = schedule();
    s.add({ name: 'a', every: 1000, running: true }, T);

    assert.deepEqual(s.due(T), [], 'it was due the instant it was added');
    assert.deepEqual(s.due(T + 999), []);
    assert.deepEqual(s.due(T + 1000), ['a']);
});

//THE ANCHOR IS A FIXED MOMENT, NOT A READING OF THE CURRENT TIME, and getting
//that wrong is silent: the job sits permanently one interval in the future and
//never runs at all. Caught by a sanity check before this file existed -- a job
//asking for a second was still not due a second and a half later.
test('the interval counts from when the clock started, not from whenever you ask', () => {
    const s = schedule();
    s.add({ name: 'a', every: 1000, running: true }, T);

    //asking repeatedly must not push it further away
    s.due(T + 100); s.due(T + 500); s.due(T + 900);

    assert.deepEqual(s.due(T + 1500), ['a'], 'asking about it moved it into the future');
});

test('firstRun now is due immediately, and only it', () => {
    const s = schedule();
    s.add({ name: 'eager', every: 60000, running: true, firstRun: 'now' }, T);
    s.add({ name: 'patient', every: 60000, running: true }, T);

    assert.deepEqual(s.due(T), ['eager']);
});

test('a stopped job is never due, whatever the clock says', () => {
    const s = schedule();
    s.add({ name: 'a', every: 1000 }, T);//running defaults to false

    assert.deepEqual(s.due(T + 100000), []);
    assert.equal(s.get('a', T).nextAt, null, 'a stopped job has a due date');
});

//STARTED MEANS "FROM NOW", not "you are late". A job switched on after being off
//for a day would otherwise fire the instant it was enabled, which reads as
//broken rather than as punctual.
test('starting a job that was off does not make it overdue', () => {
    const s = schedule();
    s.add({ name: 'a', every: 1000 }, T);

    s.start('a', T + 86400000);//a day later

    assert.deepEqual(s.due(T + 86400000), [], 'it fired the moment it was switched on');
    assert.deepEqual(s.due(T + 86400000 + 1000), ['a']);
});

//---- running ------------------------------------------------------------

test('firing runs the work and records that it did', async () => {
    const s = schedule();
    let ran = 0;

    s.add({ name: 'a', every: 1000, running: true }, T);
    s.does('a', () => { ran++; return 'done'; });

    assert.equal(await s.fire('a', T + 1000), 'done');
    assert.equal(ran, 1);

    const seen = s.get('a', T + 1000);
    assert.equal(seen.lastOk, true);
    assert.equal(seen.lastAt, T + 1000);
    assert.equal(seen.runs.length, 1);
});

//A FAILING JOB IS RECORDED AND THE CLOCK KEEPS TURNING. Throwing out of a beat
//would take every other job in the app with it.
test('a job that throws is recorded, and does not stop the beat', async () => {
    const s = schedule();
    let other = 0;

    s.add({ name: 'bad', every: 1000, running: true }, T);
    s.does('bad', () => { throw new Error('it broke'); });

    s.add({ name: 'fine', every: 1000, running: true }, T);
    s.does('fine', () => { other++; });

    const ran = await s.beat(T + 1000);

    assert.deepEqual(ran, ['bad', 'fine'], 'the beat stopped early: ' + ran.join(','));
    assert.equal(other, 1, 'the good job was skipped');

    const seen = s.get('bad', T + 1000);
    assert.equal(seen.lastOk, false);
    assert.equal(seen.lastWhy, 'it broke');
});

//THE CLOCK MOVES EVEN WHEN THERE IS NOTHING TO RUN -- the bundle is mid-reload
//and the work has not been put back yet. Without this the job becomes
//permanently overdue and fires a burst the moment it arrives.
test('a job with no work yet still moves its clock, and says so', async () => {
    const s = schedule();
    s.add({ name: 'a', every: 1000, running: true }, T);

    await s.fire('a', T + 1000);

    assert.deepEqual(s.due(T + 1000), [], 'it stayed due with nothing to run');
    assert.equal(s.get('a', T).lastWhy, 'nothing to run yet');
    assert.equal(s.get('a', T).armed, false);
});

//ONE AT A TIME. A run can take longer than its own interval whenever anything is
//really happening, and a second copy started on top of the first is how one slow
//job becomes a pile of them.
test('a job already running is not due again', async () => {
    const s = schedule();
    let release;
    const held = new Promise((r) => { release = r; });

    s.add({ name: 'slow', every: 100, running: true }, T);
    s.does('slow', () => held);

    const going = s.fire('slow', T + 100);

    assert.deepEqual(s.due(T + 100000), [], 'it was handed out again while still running');
    assert.equal(s.get('slow', T).inFlight, true);

    release();
    await going;

    assert.equal(s.get('slow', T).inFlight, false);
});

//---- surviving a save ---------------------------------------------------

//THE CASE THIS HAS TO GET RIGHT. The plugin that owns a job lives in the bundle
//that reloads, so it re-registers every few minutes while somebody is working. A
//save that reset `running` would silently switch a job off -- or on.
test('re-adding a job keeps its history and its switch', async () => {
    const s = schedule();

    s.add({ name: 'a', every: 1000, running: true, about: 'first' }, T);
    s.does('a', () => 'ok');
    await s.fire('a', T + 1000);

    //the save: same name, new interval and description, work re-supplied
    s.add({ name: 'a', every: 5000, about: 'second' }, T + 2000);

    const seen = s.get('a', T + 2000);

    assert.equal(seen.running, true, 'a save switched the job off');
    assert.equal(seen.runs.length, 1, 'a save threw away what had happened');
    assert.equal(seen.every, 5000, 'the new interval was ignored');
    assert.equal(seen.about, 'second', 'the new description was ignored');
});

test('does hands back the way to take the work off again', async () => {
    const s = schedule();
    let ran = 0;

    s.add({ name: 'a', every: 1000, running: true }, T);
    const undo = s.does('a', () => { ran++; });

    await s.fire('a', T + 1000);
    assert.equal(ran, 1);

    undo();
    await s.fire('a', T + 2000);

    assert.equal(ran, 1, 'it kept running after the work was removed');
    assert.equal(s.get('a', T).armed, false);
});

//AND ONLY ITS OWN. A reload supplies the new work before the old half's teardown
//runs, in some orders -- an undo that did not check would delete the replacement.
test('taking work off does not remove somebody else replacement', async () => {
    const s = schedule();
    let which = null;

    s.add({ name: 'a', every: 1000, running: true }, T);
    const undoOld = s.does('a', () => { which = 'old'; });
    s.does('a', () => { which = 'new'; });

    undoOld();//the old half tearing down, after the new one registered

    await s.fire('a', T + 1000);
    assert.equal(which, 'new', 'the replacement was removed by the old teardown');
});

//---- what a person sees --------------------------------------------------

test('it keeps a bounded history rather than every run ever', async () => {
    const s = makeSchedule({ keep: 3 });
    s.add({ name: 'a', every: 1, running: true }, T);
    s.does('a', () => 'ok');

    for (let at = 1; at <= 6; at++) await s.fire('a', T + at);

    const seen = s.get('a', T);
    assert.equal(seen.runs.length, 3, 'kept ' + seen.runs.length);
    assert.equal(seen.runs[2].at, T + 6, 'it kept the oldest instead of the newest');
});

test('listing says what is there, sorted, with what happened', () => {
    const s = schedule();
    s.add({ name: 'zeta', every: 1000 }, T);
    s.add({ name: 'alpha', every: 1000, running: true }, T);

    const list = s.list(T);

    assert.deepEqual(list.map((one) => one.name), ['alpha', 'zeta'], 'not sorted');
    assert.equal(list[0].running, true);
    assert.equal(list[1].running, false);
    assert.equal(list[0].nextAt, T + 1000);
    assert.equal(list[1].nextAt, null, 'a stopped job was given a due date');
});

test('a name that is not there is answered rather than thrown at', () => {
    const s = schedule();
    assert.equal(s.get('nothing', T), null);
    assert.equal(s.forget('nothing'), false);
});

test('a job needs a name and an interval', () => {
    const s = schedule();

    assert.throws(() => s.add({ every: 1000 }, T), /name/);
    assert.throws(() => s.add({ name: 'a' }, T), /interval/);
    assert.throws(() => s.add({ name: 'a', every: 0 }, T), /interval/);
    assert.throws(() => s.add({ name: 'a', every: -5 }, T), /interval/);
});

test('supplying work for a job that does not exist is a mistake, not a no-op', () => {
    const s = schedule();
    assert.throws(() => s.does('never-added', () => { }), /no scheduled job/);
});
