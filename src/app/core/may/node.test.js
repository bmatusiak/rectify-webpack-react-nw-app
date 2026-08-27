const { test } = require('node:test');
const assert = require('node:assert');

const deciding = require('./deciding');

//WHAT AN ANSWER MEANS, ASKED WITHOUT AN APP.
//
//This is the half that must never be wrong, and it is a decision about three
//values -- so it is answered here in a millisecond rather than by driving a
//window. The prompting and the file are ./main.js's, and they are the easy part.

//---- who may decide ------------------------------------------------------

//THE ONE RULE THE REST IS BUILT ON. A guard the command line can remove is a
//comment, and every refusal downstream becomes one you have to trust a model
//not to have unlocked first.
test('a decision cannot be made over the wire', () => {
    const no = deciding.mayDecide({ overTheWire: true });

    assert.ok(no, 'the control socket was allowed to decide');
    assert.ok(no.indexOf('open the window') > 0, no);
});

//A DRIVEN CLICK ARRIVES BY EXACTLY THE PATH A REAL PRESS DOES, so nothing but
//the browser's own `isTrusted` tells them apart -- see remote/window.js, which
//builds and dispatches its events.
test('an untrusted press is not a person', () => {
    const no = deciding.mayDecide({ window: true, trusted: false });

    assert.ok(no, 'a synthetic click was taken for a person');
    assert.ok(no.indexOf('untrusted') > 0, no);
});

test('a person at the window may decide', () => {
    assert.equal(deciding.mayDecide({ window: true, trusted: true }), null);
});

//NOWHERE IS NOT SOMEWHERE. A caller that forgot to say where it came from must
//not be treated as the most privileged one.
test('a decision from nowhere is refused', () => {
    assert.ok(deciding.mayDecide(null));
    assert.ok(deciding.mayDecide({}));
});

//---- what is remembered --------------------------------------------------

test('what nothing guards is simply allowed', () => {
    const out = deciding.verdict('anything', { declared: false });

    assert.equal(out.allowed, true);
    assert.ok(!out.ask, 'it wanted to ask about something nobody guards');
});

test('a guarded thing with no answer is a question, not a refusal', () => {
    const out = deciding.verdict('serve', { declared: true });

    assert.equal(out.allowed, false);
    assert.equal(out.ask, true, 'it refused instead of asking');
});

test('always and never are remembered, and never wins nothing', () => {
    assert.equal(deciding.verdict('serve', { declared: true, kept: 'always' }).allowed, true);
    assert.equal(deciding.verdict('serve', { declared: true, kept: 'never' }).allowed, false);
    assert.ok(!deciding.verdict('serve', { declared: true, kept: 'never' }).ask,
        'a never was treated as a question');
});

test('an answer for this run is honoured while the run lasts', () => {
    assert.equal(deciding.verdict('serve', { declared: true, runwise: 'always' }).allowed, true);
    assert.equal(deciding.verdict('serve', { declared: true, runwise: 'never' }).allowed, false);
});

//WHAT IS WRITTEN DOWN BEATS WHAT WAS SAID THIS RUN, because a person who set
//`never` and then answered a prompt carelessly should keep the answer they took
//the trouble to record.
test('what was written down beats what was said this run', () => {
    const out = deciding.verdict('serve', { declared: true, kept: 'never', runwise: 'always' });
    assert.equal(out.allowed, false);
});

//---- failing shut --------------------------------------------------------

//THE WRONG ANSWER IN ONE DIRECTION COSTS SOMEBODY A PRESS. The wrong answer in
//the other is something nobody agreed to.
test('an unreadable file trusts nothing that was remembered', () => {
    const out = deciding.verdict('serve', { declared: true, kept: 'always', unreadable: 'broken' });

    assert.equal(out.allowed, false, 'a remembered yes survived the file being unreadable');
    assert.equal(out.ask, true);
    assert.ok(out.why.indexOf('broken') > 0, out.why);
});

test('an empty file and an unreadable one are different answers', () => {
    assert.equal(deciding.read(null).unreadable, null);
    assert.equal(deciding.read({}).unreadable, null);
    assert.deepStrictEqual(deciding.read({}).decisions, {});

    assert.ok(deciding.read('not a document').unreadable);
    assert.ok(deciding.read({ decisions: 'nonsense' }).unreadable);
});

//A ROW THAT MAKES NO SENSE POISONS THE WHOLE FILE rather than being skipped.
//Skipping it would quietly drop a `never` somebody had set, which is the one
//direction this must never fail in.
test('one answer nobody understands makes the whole file untrusted', () => {
    const out = deciding.read({
        decisions: {
            serve: { answer: 'always' },
            markup: { answer: 'sometimes' }
        }
    });

    assert.ok(out.unreadable, 'it kept going with an answer it did not understand');
    assert.deepStrictEqual(out.decisions, {}, 'it kept the rows it did understand');
});

//`once` AND `run` MUST NOT BE IN THE FILE. Storing `once` is a contradiction,
//and a stored `run` would outlive the run it was for.
test('only always and never are ever written down', () => {
    assert.equal(deciding.keeps('always'), true);
    assert.equal(deciding.keeps('never'), true);
    assert.equal(deciding.keeps('once'), false);
    assert.equal(deciding.keeps('run'), false);

    assert.ok(deciding.read({ decisions: { serve: { answer: 'once' } } }).unreadable,
        'a `once` in the file was accepted');
});

test('the answers are the four a person can give', () => {
    assert.deepStrictEqual(deciding.ANSWERS, ['once', 'run', 'always', 'never']);
});
