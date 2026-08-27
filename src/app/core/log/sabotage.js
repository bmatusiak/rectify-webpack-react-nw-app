//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THE REDACTION IS THE SECOND LINE OF DEFENCE, NOT THE FIRST -- ./looks-like.js
//says so itself: what must not be in a log must not be sent to one. But "must
//not" is a rule somebody has to be right about every single time, and this is
//what is there for the time they were not.
//
//IT WAS BROKEN FROM ../window AND NOWHERE ELSE. Two entries in that plugin's
//list reach in here sideways -- they check that the markup is scrubbed, and with
//the durable rules rather than the narrow ones -- so a break was noticed only
//through a plugin that happens to use it. That is coverage by luck: delete or
//rewrite the window's markup and the redaction quietly stops being checked.
//
//TWO KINDS OF FAILURE, AND THEY ARE NOT SYMMETRICAL. Redacting too much makes a
//log unreadable and somebody complains the same day. Redacting too little puts a
//credential in a file that gets attached to a bug report, and nobody complains
//at all. Every entry below is the second kind, which is why they are worth
//breaking on purpose: the first kind reports itself.

module.exports = [
    //---- the shapes that must never survive --------------------------------
    {
        //A FIXED PREFIX AND A FIXED ALPHABET, so there is no guessing involved
        //and no excuse for missing it.
        what: 'a github token survives the scrub',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: "    { what: 'a github token', find: /\\bgh[pousr]_[A-Za-z0-9]{20,}/g },",
        replace: "    { what: 'a github token', find: /\\bgh[pousr]_[A-Za-z0-9]{200,}/g },"
    },
    {
        what: 'a bearer token survives the scrub',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: "    { what: 'a bearer token', find: /\\b[Bb]earer\\s+[A-Za-z0-9._~+/-]{16,}=*/g },",
        replace: "    { what: 'a bearer token', find: /\\b[Bb]earer\\s+[A-Za-z0-9._~+/-]{160,}=*/g },"
    },
    {
        //A PRIVATE KEY GOES WHOLE, NOT LINE BY LINE. Line by line leaves the
        //body of the key in the file with only its header taken out, which
        //reads as redacted and is not.
        what: 'a private key is left in the log below its header',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: "    { what: 'a private key', find: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----/g }",
        replace: "    { what: 'a private key', find: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g }"
    },
    {
        //THE NAME IS WHAT MAKES THIS SAFE TO BE SURE ABOUT. `token=` and its
        //friends -- the value alone would be indistinguishable from an id.
        what: 'a named credential keeps its value',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: '        keep: 3',
        replace: '        keep: 0'
    },

    //---- and the two profiles, which must stay two -------------------------
    {
        //THE BLUNT RULES ARE FOR A RECORD KEPT FOR EVER, and the narrow ones for
        //a live log a person is reading. Handing `durable` the narrow set means
        //../events writes the tail of every sign-in url into a file that
        //outlives the app.
        what: 'the durable profile is quietly the narrow one',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: "    PATTERNS.concat(how === 'durable' ? DURABLE : []).forEach(function (one) {",
        replace: '    PATTERNS.forEach(function (one) {'
    },
    {
        //AN UNKNOWN PROFILE IS THE NARROW ONE, NOT A WIDER ONE. A caller that
        //misspells `durable` must get the LIVE rules and a log that looks
        //under-redacted, rather than silently getting more than it asked for --
        //because the failure that gets noticed is the one worth having.
        what: 'a misspelt profile is treated as durable',
        file: 'looks-like.js',
        check: 'core/log/node',
        find: "how === 'durable' ? DURABLE : []",
        replace: 'DURABLE'
    }

    //THE ORDER THE RULES RUN IN IS NOT LISTED HERE, and that is the finding
    //rather than an omission.
    //
    //There was an entry for it -- reverse `PATTERNS.concat(DURABLE)` and watch a
    //named credential lose its name -- and it could not be caught. Measured:
    //reversing the two changes NO output, because `[redacted]` itself matches
    //the value group of the named-credential rule and the name is put back on
    //the second pass either way.
    //
    //So the comment in ./looks-like.js was wrong, not the test. It says the
    //measured thing now: the order is insurance against `HIDDEN` being spelt
    //with a space in it one day, not something today's behaviour rests on.
];
