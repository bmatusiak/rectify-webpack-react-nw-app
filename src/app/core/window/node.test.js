const { test } = require('node:test');
const assert = require('node:assert');

const { measure } = require('./main.js');

//nw hands back a buffer and nothing else, so the size printed after a capture
//is read out of the file's own header. a screen at 2x returns an image twice
//the size the window was asked to be, which is the number worth printing —
//and getting it wrong is the quiet kind of wrong, so it is pinned here.

function png(width, height) {
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(buf, 0);
    buf.write('IHDR', 12, 'ascii');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
}

function jpeg(width, height, marker) {
    const parts = [Buffer.from([0xFF, 0xD8])];

    //a comment first, so the scan has to walk past a segment to find the frame
    const comment = Buffer.alloc(6);
    comment.writeUInt16BE(0xFFFE, 0);
    comment.writeUInt16BE(4, 2);
    parts.push(comment);

    const sof = Buffer.alloc(11);
    sof.writeUInt16BE(0xFF00 | marker, 0);
    sof.writeUInt16BE(8, 2);
    sof.writeUInt8(8, 4);
    sof.writeUInt16BE(height, 5);
    sof.writeUInt16BE(width, 7);
    parts.push(sof);

    return Buffer.concat(parts);
}

test('a png says how big it is in its first chunk', () => {
    assert.deepEqual(measure(png(1326, 768), 'png'), { width: 1326, height: 768 });
    assert.deepEqual(measure(png(2652, 1536), 'png'), { width: 2652, height: 1536 });
});

test('a jpeg says so in whichever start-of-frame it chose', () => {
    //0xC0 is the ordinary one, 0xC2 is progressive, and both turn up
    assert.deepEqual(measure(jpeg(1326, 768, 0xC0), 'jpeg'), { width: 1326, height: 768 });
    assert.deepEqual(measure(jpeg(640, 480, 0xC2), 'jpeg'), { width: 640, height: 480 });
});

test('width and height do not get swapped, which a square would hide', () => {
    assert.deepEqual(measure(png(100, 200), 'png'), { width: 100, height: 200 });
    assert.deepEqual(measure(jpeg(100, 200, 0xC0), 'jpeg'), { width: 100, height: 200 });
});

test('a header it cannot read is not a failure, just no size', () => {
    //the capture is still a perfectly good file, and the caller still gets it
    assert.equal(measure(Buffer.alloc(4), 'png'), null);
    assert.equal(measure(Buffer.alloc(0), 'jpeg'), null);
    assert.equal(measure(Buffer.from([0xFF, 0xD8, 0xFF, 0xDA, 0, 2]), 'jpeg'), null);
});
