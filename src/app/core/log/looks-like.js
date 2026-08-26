//WHAT A SECRET LOOKS LIKE, IN ONE PLACE.
//
//A credential must never be a line in the log, whatever printed it -- and the
//reason this is a file of its own rather than two regexes inside ./main.js is
//the failure it is copied from. The app this came from kept its patterns in the
//logger, four more in its event store, and nine in the app IT was ported from,
//with no two agreeing. That is one rule taught separately in three places, and
//what it cost was a github token that the logger did not redact at all, sitting
//in a log somebody was reading.
//
//IT LIVES WITH THE LOG, because KNOWING and KEEPING are two jobs. The app this
//came from files it under `secret` -- the thing that seals a value on disk -- and
//that is a reasonable home too. But recognising a credential in text is needed by
//anything that writes text down, whether or not it has any credentials of its
//own, and this scaffold writes text down long before it keeps anything.
//
//IF A `secret` PLUGIN ARRIVES it consumes this rather than carrying a copy. The
//sealing is generic on its own account -- what an app DOES with credentials is
//not, and that is the line between a mechanism worth having and somebody else's
//logic.
//
//Either way there is ONE copy, and adding a second anywhere is the bug above
//starting again.
//
//NARROW ON PURPOSE, AND THAT IS THE HARD PART. The blunt rules -- anything long
//and random, the tail of every url -- would redact commit hashes, base64 payloads
//and ids, which is most of what makes a log worth reading. Every shape here is
//one that cannot plausibly be anything else.
//
//AND IT IS THE SECOND LINE OF DEFENCE, NOT THE FIRST. What must not be in a log
//must not be sent to one. This exists because "must not" is a rule somebody has
//to be right about every single time.

var HIDDEN = '[redacted]';

var PATTERNS = [
    //github issues these with a fixed prefix and a fixed alphabet, so there is
    //no guessing involved: ghp_ personal, gho_ oauth, ghu_ user, ghs_ server,
    //ghr_ refresh
    { what: 'a github token', find: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },

    //an Authorization header, or anything that copied its shape
    { what: 'a bearer token', find: /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{16,}=*/g },

    //`token=`, `key=`, `password=`, `secret=` and their friends, in a url or an
    //assignment. The NAME is what makes this safe to be sure about -- the value
    //alone would be indistinguishable from an id.
    {
        what: 'a named credential',
        find: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd)\b(\s*[=:]\s*|=)("[^"]*"|'[^']*'|[^\s&"',;]+)/gi,
        keep: 3
    },

    //a private key is unmistakable and catastrophic, so it goes whole rather
    //than line by line
    { what: 'a private key', find: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g }
];

module.exports.PATTERNS = PATTERNS;
module.exports.HIDDEN = HIDDEN;

//WHAT IT KEEPS IS AS IMPORTANT AS WHAT IT HIDES. `token=[redacted]` still says a
//token was there, which is the difference between a log a person can follow and
//one with holes in it -- so a named credential keeps its name and loses only the
//value.
module.exports.redact = function redact(text) {
    if (text === null || text === undefined) return text;

    var out = String(text);

    PATTERNS.forEach(function (one) {
        out = out.replace(one.find, function (whole) {
            if (!one.keep) return HIDDEN;

            //everything before the value: the name and the separator
            var value = arguments[one.keep];
            var at = whole.lastIndexOf(value);
            return whole.slice(0, at) + HIDDEN;
        });
    });

    return out;
};

//AND WHETHER IT WOULD CHANGE ANYTHING, without doing it -- so a caller that
//wants to refuse rather than redact can ask first. ../log does not use this; a
//durable record would.
module.exports.looksSecret = function looksSecret(text) {
    return module.exports.redact(text) !== String(text === null || text === undefined ? '' : text);
};
