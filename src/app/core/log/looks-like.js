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

//BLUNTER RULES, FOR SOMETHING KEPT FOR EVER.
//
//The list above is narrow because a live log is READ, and redacting every long
//random string would eat the commit hashes, ids and base64 payloads that make it
//worth reading. That call is right for a log and wrong for a record.
//
//WHAT CHANGES IS THE COST OF BEING WRONG IN EACH DIRECTION. A live log holds a
//few thousand lines in memory and is gone at the next restart, so a credential
//that slips through is exposed for minutes to whoever is already looking at the
//screen. A durable record is on disk for ever, is copied into backups, and is
//the first thing anybody attaches to a bug report. There, a column of
//`[redacted]` is a small price and a missed token is not recoverable.
//
//SO THEY ARE ASKED FOR BY NAME rather than one list being widened. `redact(text)`
//is the log's and stays narrow; `redact(text, 'durable')` is for anything that
//writes text down and keeps it.
//
//WHOLE URLS LOSE THEIR TAIL, not just their query. The secret in a sign-in link
//is in the path as often as in the parameters -- `claude.ai/oauth/authorize/<the
//whole point>` -- and a rule that keeps "the safe half" is a rule somebody has to
//be right about every time. The host survives, because "it is talking to
//claude.ai" is the useful part and is not the secret.
var DURABLE = [
    //ANY LONG RUN OF TOKEN-SHAPED CHARACTERS. This is the rule that would ruin a
    //log and is the right one here: what a durable record holds is sentences an
    //app composed about its own acts, and none of those need a 24-character run
    //of random to make sense.
    { what: 'something long and random', find: /\b[A-Za-z0-9_-]{24,}\b/g },

    //`\S+` AND NOT `\S*`, because there has to be something there to hide. With
    //a star, `http://localhost:8080/` matched with an empty tail and came back
    //as `http://localhost:8080/[redacted]` -- announcing a secret where there
    //was not one, in the app's own "started, listening on ..." line. A redaction
    //that fires on nothing teaches a reader to distrust the ones that fire on
    //something.
    {
        what: 'the tail of a url',
        find: /(https?:\/\/[^\s/]+)(\/\S+)/g,
        to: function (whole, host) { return host + '/' + HIDDEN; }
    }
];

module.exports.PATTERNS = PATTERNS;
module.exports.DURABLE = DURABLE;
module.exports.HIDDEN = HIDDEN;

//WHAT IT KEEPS IS AS IMPORTANT AS WHAT IT HIDES. `token=[redacted]` still says a
//token was there, which is the difference between a log a person can follow and
//one with holes in it -- so a named credential keeps its name and loses only the
//value.
//`how` IS 'durable' OR NOTHING. Not a list of patterns and not a boolean: a
//caller passing its own rules would be a second opinion about what a secret
//looks like, which is the whole failure this file exists to end -- and a boolean
//gives the two levels no names, so nobody reading the call site can tell which
//is the safe one.
module.exports.redact = function redact(text, how) {
    if (text === null || text === undefined) return text;

    var out = String(text);

    //THE NARROW RULES RUN FIRST IN BOTH CASES, so a named credential keeps its
    //name -- `token=[redacted]` rather than a bare `[redacted]` where a whole
    //assignment used to be. Running the blunt ones first would swallow the value
    //before the rule that knows what it is could label it.
    PATTERNS.concat(how === 'durable' ? DURABLE : []).forEach(function (one) {
        out = out.replace(one.find, function (whole) {
            if (one.to) return one.to.apply(null, arguments);
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
