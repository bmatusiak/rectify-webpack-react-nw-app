var crypto = require('node:crypto');

//IS THIS THE TOKEN, ASKED IN ONE PLACE.
//
//The socket is only as closed as this answer. A named pipe on windows is
//reachable by anyone logged into the machine and `/tmp` on posix is
//world-readable -- see ./endpoint.js -- so being hard to find was never what was
//protecting it. This is.
//
//A MODULE BECAUSE ./node.test.js HAD WRITTEN ITS OWN COPY. Three tests checked a
//re-implementation sitting in the test file: the length check, the prefix, the
//throw on a mismatch -- all correct, all about code the app does not run. The
//real comparison in ./main.js could have been replaced with `return true` and
//every one of them would still have passed.
//
//A rule with two implementations is two rules, and the one that drifts is
//whichever nobody reads. Same cut as ../bridge/isTop.js and ../may/deciding.js.

//`given` IS WHATEVER ARRIVED ON THE WIRE, so it may be anything at all --
//undefined, a number, an object. It is made a string before it is measured.
module.exports = function correct(secret, given) {
    var a = Buffer.from(String(given || ''), 'utf8');
    var b = Buffer.from(String(secret || ''), 'utf8');

    //THE LENGTH IS CHECKED FIRST BECAUSE `timingSafeEqual` THROWS ON A MISMATCH,
    //and an exception here would be a crash on every malformed greeting -- which
    //is a denial of service anybody can send.
    //
    //IT ALSO LEAKS THE LENGTH, and that is the accepted cost: the alternative is
    //hashing both sides to a fixed width, and the length of a 32-byte random
    //token is not the secret.
    if (a.length !== b.length) return false;

    //`==` WOULD LEAK HOW MUCH OF THE TOKEN WAS RIGHT, one character at a time.
    //Over a local socket that is a stretch, but it costs nothing to do properly.
    return crypto.timingSafeEqual(a, b);
};
