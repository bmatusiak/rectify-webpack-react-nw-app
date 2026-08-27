const { test } = require('node:test');
const assert = require('node:assert');

const wire = require('./wire');
const isTop = require('./isTop');

//the packaged build has no socket. What carries messages between main and the
//window is this, so its behaviour is worth pinning: acks that come back, acks
//that come back once, and a line that is not ours doing nothing at all.

//two wires wired to each other, which is what the real pair amounts to
function pair() {
    let a, b;
    a = wire((line) => b.receive(line));
    b = wire((line) => a.receive(line));
    return { a, b };
}

//AN ANSWER THAT NEVER COMES IS A FAILURE, NOT A HANG.
//
//Every test below that waits for an ack was `await new Promise(...)` with
//nothing else in the race, so a wire that lost the reply hung the whole FILE
//rather than failing one test. Its own sabotage said so in as many words:
//"core/bridge/node never finished rather than failing -- give that test a
//timeout, so the failure is one somebody can read".
//
//A HANG IS THE WORST SHAPE A FAILURE CAN TAKE. Nothing names the test, nothing
//names the file, and the run has to be killed -- so what is reported is "the
//suite timed out", which is true of every test in it equally.
function answered(fn, what) {
    return Promise.race([
        new Promise(fn),
        new Promise((resolve, reject) => setTimeout(
            () => reject(new Error(what || 'no answer came back')), 2000).unref())
    ]);
}

//---- is this frame the page, or something inside it -----------------------
//
//`document-start` FIRES FOR EVERY FRAME. The demo's Markdown page renders into a
//srcdoc iframe, and main repointed at it -- the bridge attached to a frame with
//none of the app in it, and the window ended up reporting itself a browser, four
//steps from the cause.
//
//THIS WAS A CLOSURE INSIDE ./main.js UNTIL ITS OWN SABOTAGE SURVIVED. main.js was
//broken on purpose and every check passed, because nothing could reach the rule
//to ask it anything.

test('a top-level document is its own parent', () => {
    const top = {};
    top.parent = top;

    assert.equal(isTop(top), true);
});

test('an iframe is not the page', () => {
    const page = {};
    page.parent = page;

    assert.equal(isTop({ parent: page }), false, 'an iframe was taken for the window');
});

//THE CHEAP ANSWER, AND IT CAN ONLY BE A TRUE POSITIVE. Asking it first keeps
//chromium quiet: reading `frame.parent` in a packaged build warns about
//Cross-Origin-Opener-Policy every single time, into a log somebody is reading.
test('the window main was handed is the page, without asking the frame', () => {
    const own = {
        get parent() { throw new Error('this must not be reached'); }
    };

    assert.equal(isTop(own, own), true);
});

//A STALE `win.window` -- which is what it is during document-start for a reload
//-- is a DIFFERENT object, so the cheap answer says false rather than lying, and
//the frame gets asked.
test('a frame that is not the window it was handed is still asked', () => {
    const stale = { parent: 'something else' };
    const frame = {};
    frame.parent = frame;

    assert.equal(isTop(frame, stale), true, 'it trusted a stale window over the frame itself');
});

//NEITHER WOULD ANSWER, so it is not ours to inject into. Without this the
//packaged window was classified as not-top, skipped injection at
//document-start, and worked only because `loaded` puts the way home back
//afterwards -- working by luck.
test('a frame that refuses to answer is not the page', () => {
    const refuses = { get parent() { throw new Error('COOP'); } };

    assert.equal(isTop(refuses), false);
    assert.equal(isTop(null), false, 'nothing was taken for the page');
});

//---- the wire -------------------------------------------------------------

test('a call that loses its answer fails rather than hanging', async () => {
    const { a, b } = pair();
    b.on('silence', () => { /* answers nothing, ever */ });

    await assert.rejects(
        answered((resolve) => a.emit('silence', {}, resolve), 'the reply never came'),
        /never came/);
});

test('a message arrives with its data', () => {
    const { a, b } = pair();
    let seen = null;

    b.on('hello', (data) => { seen = data; });
    a.emit('hello', { from: 'main' });

    assert.deepEqual(seen, { from: 'main' });
});

test('an ack comes back to the caller that asked for one', async () => {
    const { a, b } = pair();
    b.on('add', (data, reply) => reply(data.x + data.y));

    const answer = await answered((resolve) => a.emit('add', { x: 2, y: 3 }, resolve),
        'the ack never came back to the caller that asked for one');
    assert.equal(answer, 5);
});

test('two calls in flight do not get each other answers', async () => {
    const { a, b } = pair();
    const held = [];
    b.on('slow', (data, reply) => held.push(() => reply(data.n * 10)));

    //THE ONE THAT HUNG. Routing a reply by "whoever asked most recently" leaves
    //the other caller waiting for ever, and without a timeout that took the
    //whole file down rather than failing this test.
    const first = answered((r) => a.emit('slow', { n: 1 }, r), 'the first caller never got its answer');
    const second = answered((r) => a.emit('slow', { n: 2 }, r), 'the second caller never got its answer');

    //answered out of order on purpose
    held[1]();
    held[0]();

    assert.deepEqual(await Promise.all([first, second]), [10, 20]);
});

test('a handler that answers twice is only heard once', async () => {
    const { a, b } = pair();
    b.on('once', (data, reply) => { reply('first'); reply('second'); });

    let count = 0;
    const answer = await answered((resolve) => a.emit('once', {}, (value) => { count++; resolve(value); }),
        'the first of two answers never arrived');

    assert.equal(answer, 'first');
    assert.equal(count, 1);
});

//AND IT DOES NOT SEND ONE EITHER, which is a different fact from the one above
//and the only one that is checkable here.
//
//THE TEST ABOVE CANNOT SEE THE DIFFERENCE. The receiving end deletes `pending`
//when the first answer lands, so a second reply arrives for a caller nobody is
//waiting for and vanishes -- the far end being tidy hides the near end being
//wrong. Its own sabotage proved that by surviving: `if (answered) return` was
//removed and every assertion still passed.
//
//SO THIS COUNTS WHAT WENT ON THE WIRE. Two protocol messages for one call is a
//bug whether or not the other end happens to swallow the second, and the id it
//carries belongs to whatever has since taken that number.
test('a handler that answers twice sends one reply, not two', () => {
    const sent = [];
    const b = wire((line) => sent.push(JSON.parse(line)));

    b.on('once', (data, reply) => { reply('first'); reply('second'); });
    b.receive(JSON.stringify({ event: 'once', data: {}, id: 7 }));

    const replies = sent.filter((msg) => msg.reply === 7);

    assert.equal(replies.length, 1, 'it put ' + replies.length + ' answers on the wire for one call');
    assert.equal(replies[0].data, 'first');
});

test('nothing is left waiting once an answer is in', async () => {
    const { a, b } = pair();
    b.on('ping', (data, reply) => reply('pong'));

    assert.equal(a.waiting, 0);
    await answered((r) => a.emit('ping', {}, r), 'the ping was never answered');
    assert.equal(a.waiting, 0, 'the pending entry is not cleaned up');
});

test('a message nobody is listening for is dropped, not thrown', () => {
    const { a } = pair();
    assert.doesNotThrow(() => a.emit('nobody-home', { x: 1 }));
});

test('a line that is not json is ignored rather than crashing the channel', () => {
    const { a, b } = pair();
    let seen = 0;
    b.on('after', () => { seen++; });

    assert.doesNotThrow(() => b.receive('not json at all'));
    a.emit('after', {});

    assert.equal(seen, 1, 'the channel still works after being handed rubbish');
});

test('off stops one listener without touching the others', () => {
    const { a, b } = pair();
    let one = 0, two = 0;
    const first = () => { one++; };

    b.on('tick', first);
    b.on('tick', () => { two++; });

    a.emit('tick', {});
    b.off('tick', first);
    a.emit('tick', {});

    assert.equal(one, 1);
    assert.equal(two, 2);
});

test('once fires once', () => {
    const { a, b } = pair();
    let count = 0;
    b.once('app', () => { count++; });

    a.emit('app', {});
    a.emit('app', {});

    assert.equal(count, 1);
});
