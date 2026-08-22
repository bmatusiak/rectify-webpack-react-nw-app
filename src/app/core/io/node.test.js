const { test } = require('node:test');
const assert = require('node:assert');

const fanout = require('./fanout');

//THE PARTS OF THIS PLUGIN THAT ANSWER WITHOUT AN APP.
//
//./server.test.js and ./window.test.js run INSIDE the app, against the real
//services. These two are plain node: ./fanout.js and ./mock.js are modules,
//and asking them a question needs nothing running. Both used to be in test/,
//under names that said what they were about rather than whose they were.

//---- fanout ------------------------------------------------------------
// One `io` over however many transports there are: the nw window on the bridge,
// a browser on socket.io. ./serve.js registers its handlers once
// and this spreads them.
//
// PURPOSE-BUILT FAKES RATHER THAN ./mock.js. That one is a socket.io-
// shaped PAIR for running the server half in the page, and its `io` has no
// socket map and fires `connection` once per listener -- which is not what a
// server does and would make these tests agree with the wrong thing.

function transport() {
    const listeners = [];
    const sockets = new Map();
    const sent = [];
    let closed = 0;
    let dropped = 0;

    return {
        on(event, fn) { if (event === 'connection') listeners.push(fn); },
        emit(event, data) { sent.push({ event, data }); },
        disconnectSockets() { dropped++; },
        close() { closed++; },

        get sockets() { return { sockets }; },
        get engine() { return { clientsCount: sockets.size }; },

        // what a test does to it
        connect(id) {
            const socket = { id };
            sockets.set(id, socket);
            listeners.slice().forEach((fn) => fn(socket));
            return socket;
        },
        drop(id) { sockets.delete(id); },

        // what a test asks of it
        sent, get closed() { return closed; }, get dropped() { return dropped; }
    };
}

test('a handler hears every transport', () => {
    const a = transport();
    const b = transport();
    const io = fanout([a, b]);

    const seen = [];
    io.on('connection', (socket) => seen.push(socket.id));

    a.connect('window');
    b.connect('browser');

    assert.deepEqual(seen, ['window', 'browser']);
});

// THE ONE THAT COST AN AFTERNOON.
//
// The node half is torn down and rebuilt on every save, so serve.js registers
// again on each reload -- and by then the window has long since connected. Over
// socket.io that was invisible: the reload drops every client and the client
// reconnects, firing `connection` again. The bridge has no reconnect, because
// its peer never left, so the new build sat there with no clients at all.
test('a handler registered after a socket connected is handed it anyway', () => {
    const bridge = transport();
    const io = fanout([bridge]);

    bridge.connect('window');

    const seen = [];
    io.on('connection', (socket) => seen.push(socket.id));

    assert.deepEqual(seen, ['window'], 'the late handler was never told about the window');
});

test('the replay does not double up on a handler that already saw it', () => {
    const bridge = transport();
    const io = fanout([bridge]);

    const seen = [];
    io.on('connection', (socket) => seen.push(socket.id));
    bridge.connect('window');

    assert.deepEqual(seen, ['window'], 'heard it ' + seen.length + ' times');
});

// A socket.io client dropped by the reload is out of the map by the time the
// next handler registers, and comes back the ordinary way. Replaying it would
// hand the new build a client that is not there.
test('only what is still connected is replayed', () => {
    const browsers = transport();
    const io = fanout([browsers]);

    browsers.connect('gone');
    browsers.drop('gone');

    const seen = [];
    io.on('connection', (socket) => seen.push(socket.id));

    assert.deepEqual(seen, []);
});

// The server half calls this on teardown so the previous build stops answering.
// What it must NOT do is take the fan-out's own forwarding with it, or the next
// build would never hear a connection again.
test('removeAllListeners drops the app handlers and keeps the wiring', () => {
    const bridge = transport();
    const io = fanout([bridge]);

    const old = [];
    io.on('connection', (socket) => old.push(socket.id));
    io.removeAllListeners('connection');

    const fresh = [];
    io.on('connection', (socket) => fresh.push(socket.id));
    bridge.connect('window');

    assert.deepEqual(old, [], 'the old build is still being told about connections');
    assert.deepEqual(fresh, ['window'], 'the new build hears nothing');
});

test('off removes one handler and leaves the rest', () => {
    const bridge = transport();
    const io = fanout([bridge]);

    const kept = [];
    const going = [];
    const goner = (s) => going.push(s.id);

    io.on('connection', (s) => kept.push(s.id));
    io.on('connection', goner);
    io.off('connection', goner);

    bridge.connect('window');

    assert.deepEqual(kept, ['window']);
    assert.deepEqual(going, []);
});

test('an emit reaches every transport', () => {
    const a = transport();
    const b = transport();
    fanout([a, b]).emit('server:error', { message: 'x' });

    assert.equal(a.sent.length, 1);
    assert.equal(b.sent.length, 1);
    assert.equal(a.sent[0].event, 'server:error');
});

test('close and disconnectSockets reach every transport', () => {
    const a = transport();
    const b = transport();
    const io = fanout([a, b]);

    io.disconnectSockets(true);
    io.close();

    assert.equal(a.dropped, 1);
    assert.equal(b.dropped, 1);
    assert.equal(a.closed, 1);
    assert.equal(b.closed, 1);
});

test('the socket map and the client count are the sum of the parts', () => {
    const bridge = transport();
    const browsers = transport();
    const io = fanout([bridge, browsers]);

    bridge.connect('window');
    browsers.connect('one');
    browsers.connect('two');

    assert.equal(io.sockets.sockets.size, 3);
    assert.equal(io.engine.clientsCount, 3);
    assert.ok(io.sockets.sockets.get('window'), 'the window is not findable by name');

    // BUILT FRESH ON EVERY READ, because the underlying maps are the real ones
    // and a snapshot taken at construction would be a lie by the time anybody
    // looked at it. selftest/main.js walks this to find the page.
    browsers.drop('one');
    assert.equal(io.sockets.sockets.size, 2);
});

// One transport failing is not the other transports' problem: a browser going
// away mid-emit should not stop the window being told.
test('a transport that throws does not take the others with it', () => {
    const broken = transport();
    broken.emit = () => { throw new Error('gone'); };

    const fine = transport();
    fanout([broken, fine]).emit('ping', {});

    assert.equal(fine.sent.length, 1, 'the working transport was skipped');
});

test('a missing transport is simply not one', () => {
    const only = transport();
    const io = fanout([null, only, undefined]);

    assert.equal(io.transports, 1);

    const seen = [];
    io.on('connection', (s) => seen.push(s.id));
    only.connect('window');
    assert.deepEqual(seen, ['window']);
});

//---- mock --------------------------------------------------------------
const mockPair = require('./mock');

//the mock is what lets the browser run a plugin's server half with nothing on
//the wire, so it has to behave like the socket.io it stands in for.

test('io.on("connection") hands over a socket', async () => {
    const { io } = mockPair();
    const socket = await new Promise((resolve) => io.on('connection', resolve));
    assert.equal(typeof socket.emit, 'function');
    assert.equal(typeof socket.on, 'function');
});

test('emits cross from the server side to the client side', async () => {
    const { io, socket } = mockPair();
    io.on('connection', (s) => s.emit('app', { title: 'mock' }));
    const app = await new Promise((resolve) => socket.once('app', resolve));
    assert.deepEqual(app, { title: 'mock' });
});

test('a client emit reaches a handler registered on the server side', async () => {
    const { io, socket } = mockPair();
    io.on('connection', (s) => s.on('ping', (data, ack) => ack({ pong: true, saw: data })));

    const reply = await new Promise((resolve) => socket.emit('ping', { n: 1 }, resolve));
    assert.deepEqual(reply, { pong: true, saw: { n: 1 } });
});

test('once() only fires once, off() removes a handler', async () => {
    const { io, socket } = mockPair();
    let onceCount = 0, offCount = 0;
    const offHandler = () => offCount++;

    io.on('connection', (s) => {
        socket.once('tick', () => onceCount++);
        socket.on('tick', offHandler);
        s.emit('tick');
        setTimeout(() => { socket.off('tick', offHandler); s.emit('tick'); }, 10);
    });

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(onceCount, 1, 'once fired more than once');
    assert.equal(offCount, 1, 'off did not remove the handler');
});

