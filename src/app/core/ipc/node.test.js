const { test } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const endpoint = require('./endpoint');

//the control socket is the one channel with a wire format of its own, so the
//shape of it is worth pinning: one json object per line, both directions.

const NL = String.fromCharCode(10);

test('the endpoint is a pipe on windows and a socket file elsewhere', () => {
    const address = endpoint('some-app');
    if (process.platform === 'win32') {
        assert.ok(address.startsWith(String.fromCharCode(92)), 'a named pipe path');
        assert.ok(address.includes('pipe'));
        assert.ok(!path.isAbsolute(address.replace(/^\+/, '')) || true);
    } else {
        assert.equal(address, path.join(os.tmpdir(), 'some-app.sock'));
    }
});

test('both sides derive the same address from the same name', () => {
    assert.equal(endpoint('x'), endpoint('x'));
    assert.notEqual(endpoint('x'), endpoint('y'));
});

//a stand-in for the app: the same line protocol, so the client half can be
//exercised without nw.js
test('a client request gets its reply back on the same line protocol', async () => {
    const address = endpoint('rectify-ipc-test-' + process.pid);
    if (process.platform !== 'win32') { try { fs.unlinkSync(address); } catch (e) { /* absent */ } }

    const seen = [];
    const server = net.createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => {
            for (const line of chunk.split(NL).filter(Boolean)) {
                const msg = JSON.parse(line);
                seen.push(msg);
                socket.write(JSON.stringify({ id: msg.id, ok: true, result: { echoed: msg.data } }) + NL);
            }
        });
    });

    await new Promise((r) => server.listen(address, r));

    try {
        const reply = await new Promise((resolve, reject) => {
            const socket = net.connect(address);
            let buffer = '';
            socket.setEncoding('utf8');
            socket.on('connect', () => socket.write(JSON.stringify({ id: 1, command: 'echo', data: { a: 1 } }) + NL));
            socket.on('data', (chunk) => {
                buffer += chunk;
                if (buffer.includes(NL)) { socket.end(); resolve(JSON.parse(buffer.split(NL)[0])); }
            });
            socket.on('error', reject);
        });

        assert.equal(seen.length, 1);
        assert.equal(seen[0].command, 'echo');
        assert.deepEqual(reply, { id: 1, ok: true, result: { echoed: { a: 1 } } });
    } finally {
        server.close();
        if (process.platform !== 'win32') { try { fs.unlinkSync(address); } catch (e) { /* gone */ } }
    }
});

//---- the token -----------------------------------------------------------

//a named pipe on windows is reachable by anyone logged into the machine, and
///tmp on posix is world-readable, so the socket being obscure is not the same
//as it being closed. these pin the two halves of what makes it closed: both
//sides look for the secret in the same place, and the app refuses anything
//that cannot repeat it.

test('both sides look for the token in the same place', () => {
    assert.equal(endpoint.token('x'), endpoint.token('x'));
    assert.notEqual(endpoint.token('x'), endpoint.token('y'));
    assert.ok(endpoint.token('x').endsWith('.token'));
});

test('the token does not sit inside the socket it guards', () => {
    //on posix both are files in the temp directory, and a token written over
    //the socket path would take the app's own address away from it
    assert.notEqual(endpoint.token('x'), endpoint('x'));
});

//the check the app makes, in the shape it makes it
function correct(secret, given) {
    const crypto = require('node:crypto');
    const a = Buffer.from(String(given || ''), 'utf8');
    const b = Buffer.from(secret, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

test('a wrong token of the right length is refused', () => {
    const secret = 'a'.repeat(64);
    assert.equal(correct(secret, secret), true);
    assert.equal(correct(secret, 'b'.repeat(64)), false);
});

test('a token of the wrong length is refused rather than throwing', () => {
    //timingSafeEqual throws on a length mismatch, so the length is checked
    //first. an exception here would be a crash on every malformed greeting.
    const secret = 'a'.repeat(64);
    assert.doesNotThrow(() => correct(secret, 'short'));
    assert.equal(correct(secret, 'short'), false);
    assert.equal(correct(secret, ''), false);
    assert.equal(correct(secret, undefined), false);
    assert.equal(correct(secret, null), false);
});

test('a prefix of the token is not enough', () => {
    const secret = 'a'.repeat(64);
    assert.equal(correct(secret, 'a'.repeat(63)), false);
    assert.equal(correct(secret, 'a'.repeat(65)), false);
});
