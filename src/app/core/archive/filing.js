//WHAT MAY BECOME A FILE HERE, AND HOW BIG IT MAY BE.
//
//NOTHING THAT ARRIVES HERE IS TRUSTED, and that is the difference between this
//and ../state's rule. A document name is chosen by a plugin in this app; a file
//name arrives WITH the bytes, from wherever they came from. So the rule is an
//allow list rather than a hunt for every spelling of "the parent directory" -- a
//name either matches or it is not a name. Being sure you thought of every
//traversal is not a thing anybody manages twice.

//A NAME SOMETHING ELSE MAY SEND. No directory component, because there is
//nothing to traverse out of if one never arrives.
var NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

var LONGEST = 120;

//BIG ENOUGH FOR A PACKAGED BUILD OR A FIRMWARE IMAGE, small enough that a
//runaway writer cannot fill the disk before anybody notices.
var MOST = 256 * 1024 * 1024;

//AND SMALL ENOUGH TO PUT ON A SCREEN. Past this the answer is "open it from the
//folder" rather than two megabytes of text down a socket.
var READABLE = 2 * 1024 * 1024;

//WHETHER A NAME IS ONE THIS WILL ACCEPT, SAID AS A SENTENCE rather than a
//boolean -- because the caller has to tell whoever sent it why it was refused,
//and "false" is not something anybody can act on.
//
//null MEANS YES, which reads backwards for a moment and is the shape that keeps
//every call site the same: `var no = nameIsOk(x); if (no) return refuse(no);`
function nameIsOk(name) {
    var n = String(name == null ? '' : name);

    if (!n) return 'it needs a name';
    if (n.length > LONGEST) return 'that name is longer than ' + LONGEST + ' characters';

    if (!NAME.test(n)) {
        return 'a name may contain letters, numbers, dot, dash and underscore, and must start '
            + 'with a letter or a number -- no directories, and no path of any kind';
    }

    return null;
}

//FOR A LABEL RATHER THAN A PATH. Anything that is going to be shown next to the
//file -- where the bytes came from, what made them -- is squeezed into something
//harmless instead of being refused, because it never becomes a file name.
function safe(text) {
    return String(text == null || text === '' ? 'unknown' : text)
        .replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, LONGEST);
}

//WHETHER BYTES ARE TEXT, DECIDED BY LOOKING RATHER THAN BY THE NAME.
//
//A NUL BYTE IS THE TELL, and it is checked over the first few kilobytes rather
//than the whole thing: a file that is text for a megabyte and binary after it is
//not a file anybody wants rendered either way, and reading all of it to find out
//is the cost this is avoiding.
//
//WHY IT MATTERS: rendering a binary as text produces a screen of replacement
//characters, which looks like corruption rather than like "this is not text".
//Refusing says which.
function looksText(bytes) {
    if (!bytes || !bytes.length) return true;//nothing is not binary

    var look = Math.min(bytes.length, 8192);
    for (var i = 0; i < look; i++) if (bytes[i] === 0) return false;

    return true;
}

module.exports.NAME = NAME;
module.exports.LONGEST = LONGEST;
module.exports.MOST = MOST;
module.exports.READABLE = READABLE;
module.exports.nameIsOk = nameIsOk;
module.exports.safe = safe;
module.exports.looksText = looksText;
