const { test } = require('node:test');
const assert = require('node:assert');

const wire = require('./wire');

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

    const answer = await new Promise((resolve) => a.emit('add', { x: 2, y: 3 }, resolve));
    assert.equal(answer, 5);
});

test('two calls in flight do not get each other answers', async () => {
    const { a, b } = pair();
    const held = [];
    b.on('slow', (data, reply) => held.push(() => reply(data.n * 10)));

    const first = new Promise((r) => a.emit('slow', { n: 1 }, r));
    const second = new Promise((r) => a.emit('slow', { n: 2 }, r));

    //answered out of order on purpose
    held[1]();
    held[0]();

    assert.deepEqual(await Promise.all([first, second]), [10, 20]);
});

test('a handler that answers twice is only heard once', async () => {
    const { a, b } = pair();
    b.on('once', (data, reply) => { reply('first'); reply('second'); });

    let count = 0;
    const answer = await new Promise((resolve) => a.emit('once', {}, (value) => { count++; resolve(value); }));

    assert.equal(answer, 'first');
    assert.equal(count, 1);
});

test('nothing is left waiting once an answer is in', async () => {
    const { a, b } = pair();
    b.on('ping', (data, reply) => reply('pong'));

    assert.equal(a.waiting, 0);
    await new Promise((r) => a.emit('ping', {}, r));
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
