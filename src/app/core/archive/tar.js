//WHAT IS INSIDE A TAR, WITHOUT UNPACKING IT ANYWHERE.
//
//WHY THIS IS EIGHTY LINES AND NOT A DEPENDENCY. The app this came from vendors
//nanotar -- 326 lines, MIT, and a perfectly good library -- to answer exactly one
//question: what is in this thing somebody handed back. Half of what it carries
//writes tars, which nothing here does.
//
//A tar is a sequence of 512-byte headers, each followed by its file's bytes
//rounded up to 512. Listing what is in one is a loop over that, and the honest
//version of it is shorter than the licence file. So this reads, refuses what it
//does not understand, and says which -- rather than pulling in a build from a
//registry to do the same thing with more of it.
//
//WHAT IT UNDERSTANDS: ustar, in both the POSIX spelling and the older GNU one.
//Regular files, directories, and the `prefix` field that carries the first part
//of a long path.
//
//WHAT IT REFUSES BY NAME: PAX extended headers and GNU long-name records. Both
//store the real name in a preceding entry rather than in the header, and a
//reader that ignored them would list `././@PaxHeader` and a truncated name and
//call that the answer. Saying "this tar uses extended headers, which this cannot
//read" is the difference between a limit and a lie.

var BLOCK = 512;

//`ustar` AT OFFSET 257 is the header magic, in both spellings. A tar is also a
//whole number of blocks, which is the cheap half of the check.
var MAGIC_AT = 257;

function looksGzipped(bytes) {
    return !!(bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

function looksTar(bytes) {
    if (!bytes || bytes.length < BLOCK || (bytes.length % BLOCK) !== 0) return false;
    return bytes.toString('latin1', MAGIC_AT, MAGIC_AT + 5) === 'ustar';
}

//A FIELD IS NUL-PADDED AND MAY BE NUL-TERMINATED EARLY.
function text(bytes, from, length) {
    var raw = bytes.toString('latin1', from, from + length);
    var end = raw.indexOf('\0');
    return (end < 0 ? raw : raw.slice(0, end)).trim();
}

//SIZES ARE OCTAL, IN ASCII, WHICH IS THE ONE THING ABOUT TAR THAT SURPRISES
//EVERYBODY. An empty or unreadable field is zero rather than NaN, because NaN
//propagates into the offset and turns a bad entry into an endless loop.
function octal(bytes, from, length) {
    var said = text(bytes, from, length);
    var n = parseInt(said, 8);
    return isFinite(n) && n >= 0 ? n : 0;
}

//---------------------------------------------------------------------------
//EVERY ENTRY, OR AN HONEST REFUSAL.
//
//`{ files: [...], unreadable: null }` or `{ files: [], unreadable: 'why' }`.
//Never a half-answer: a partial listing presented as a listing is the failure
//mode worth avoiding here, because it looks exactly like a small archive.
function entries(bytes) {
    var out = { files: [], unreadable: null };

    if (looksGzipped(bytes)) {
        out.unreadable = 'it is gzipped -- unpack it first';
        return out;
    }

    if (!looksTar(bytes)) {
        out.unreadable = 'there is no tar header where one should be';
        return out;
    }

    var at = 0;

    while (at + BLOCK <= bytes.length) {
        var name = text(bytes, at, 100);

        //TWO EMPTY BLOCKS END A TAR, and one empty name is enough to stop on --
        //everything after it is padding.
        if (!name) break;

        var size = octal(bytes, at + 124, 12);
        var kind = text(bytes, at + 156, 1) || '0';

        if (kind === 'x' || kind === 'g') {
            out.files = [];
            out.unreadable = 'it uses PAX extended headers, which this cannot read';
            return out;
        }

        if (kind === 'L' || kind === 'K') {
            out.files = [];
            out.unreadable = 'it uses GNU long-name records, which this cannot read';
            return out;
        }

        //THE PREFIX IS THE FIRST PART OF A LONG PATH, and joining it back on is
        //the difference between `main.js` and `src/app/core/main.js`.
        var prefix = text(bytes, at + 345, 155);

        out.files.push({
            name: prefix ? prefix + '/' + name : name,
            bytes: size,
            directory: kind === '5' || /\/$/.test(name)
        });

        //the header, then the content rounded up to whole blocks
        at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    }

    return out;
}

module.exports.BLOCK = BLOCK;
module.exports.looksGzipped = looksGzipped;
module.exports.looksTar = looksTar;
module.exports.entries = entries;
