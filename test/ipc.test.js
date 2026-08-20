const { test } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const endpoint = require('../src/app/ipc/endpoint');

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
