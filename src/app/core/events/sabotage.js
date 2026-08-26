//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THE FAILURES HERE ARE ALL QUIET ONES, which is why the list is long for a
//plugin this size. A record that keeps the wrong things still fills up, still
//answers, and still looks like a record -- and the first anybody knows is the
//day they go looking for what happened and it is not there.
//
//THE RULE GOES TO ./node.test.js in a tenth of a second; the seam and the
//bookmark need the real log, so they restart the app. `main.js` is read off disk
//by the boot and never again -- see ../../../../tools/sabotage.js.

module.exports = [
    //---- the rule, answered without an app ---------------------------------
    {
        //THE MEASURED ONE. Asking the allowlist first let every socket entry
        //through on a kept tag, and 89 of 400 rows became one poll repeating
        //itself while the acts scrolled out of the file.
        what: 'the allowlist is asked before the deny list, so weather gets in',
        file: 'keeping.js',
        check: 'core/events/node',
        find: '    if (tags.some(function (t) { return never.indexOf(t) >= 0; })) return false;\n\n    return tags.some(function (t) { return keep.indexOf(t) >= 0; });',
        replace: '    if (tags.some(function (t) { return keep.indexOf(t) >= 0; })) return true;\n\n    return !tags.some(function (t) { return never.indexOf(t) >= 0; });'
    },
    {
        what: 'command output is recorded as though it were an act',
        file: 'keeping.js',
        check: 'core/events/node',
        find: "    if (entry.level === 'out') return false;",
        replace: '    //sabotaged'
    },
    {
        what: 'the row keeps the log id, which means something different every restart',
        file: 'keeping.js',
        check: 'core/events/node',
        find: '        seq: seq,',
        replace: '        seq: seq,\n        id: entry.id,'
    },
    {
        what: 'nothing is redacted on the way in',
        file: 'keeping.js',
        check: 'core/events/node',
        find: "function scrub(text) { return looksLike.redact(text, 'durable'); }",
        replace: 'function scrub(text) { return text; }'
    },
    {
        //THE NARROW PROFILE IS THE LOG'S AND IS NOT ENOUGH HERE: an authorize
        //url arrives under a tag the allowlist keeps, so this is the only thing
        //standing between a sign-in and a file that lives for ever.
        what: 'the record is scrubbed with the log rules instead of the durable ones',
        file: 'keeping.js',
        check: 'core/events/node',
        find: "return looksLike.redact(text, 'durable');",
        replace: 'return looksLike.redact(text);'
    },

    //---- and the record itself, inside the app -----------------------------
    {
        what: 'the seam is never taken, so the log feeds nothing',
        file: 'main.js',
        check: 'core/events/main',
        restart: true,
        find: '    var unkeep = log.keeper(keep);',
        replace: '    var unkeep = function () { };'
    },
    {
        //MOVED FROM main.js TO keeping.js, AND THAT MOVE IS THE FINDING. Both
        //this and the truncated line below are about surviving a restart, so
        //nothing inside a running app could reach either without restarting it
        //-- and both survived. The parsing was file handling sitting in the
        //plugin; as text in, rows out, it is answered in a millisecond.
        what: 'the count restarts with the process, so a bookmark skips acts',
        file: 'keeping.js',
        check: 'core/events/node',
        find: '        if (!e.seq) e.seq = ++last;\n        else last = Math.max(last, Number(e.seq) || 0);',
        replace: '        e.seq = ++last;'
    },
    {
        //A SABOTAGE THAT WRITES INTO THE APP'S OWN RECORD MUST NOT LEAVE
        //PERMANENT DAMAGE. The first version of this made the count a timestamp
        //-- `last = Math.floor(entry.at / 1000)` -- which is caught, and is also
        //written to disk, and is then read back as the highest count on every
        //start after it. One run left the real record numbering its acts from
        //1787773770 for ever.
        //
        //Not incrementing is the same fault seen from the test's side (two acts,
        //one count) and costs a duplicate rather than a poisoned counter.
        what: 'two acts in one millisecond are given the same count',
        file: 'main.js',
        check: 'core/events/main',
        restart: true,
        find: '        var made = keeping.row(entry, ++last);',
        replace: '        var made = keeping.row(entry, last);'
    },
    {
        what: 'a half-written last line is treated as the whole file being lost',
        file: 'keeping.js',
        check: 'core/events/node',
        find: '        try { rows.push(JSON.parse(line)); } catch (e) { /* the last one, cut short */ }',
        replace: '        rows.push(JSON.parse(line));'
    }
];
