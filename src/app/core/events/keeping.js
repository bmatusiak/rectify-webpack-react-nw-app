var looksLike = require('../log/looks-like');

//WHICH LINES ARE ACTS, AND WHAT MAY NOT SURVIVE INSIDE ONE.
//
//A module rather than part of ./main.js because it is the half worth asking
//without an app -- see ./node.test.js -- and because it is the half most likely
//to be wrong. Everything else here is file handling.

//THE DEFAULT POLICY, WHICH AN APP IS EXPECTED TO REPLACE.
//
//These are the tags THIS scaffold writes under, and they are deliberately few:
//an app's own vocabulary -- `task`, `queue`, `deploy` -- belongs in its
//src/config.js and not in a core plugin. See ./README.md.
var KEEP = [
    'app',      //started, shutting down. Without these a record cannot answer
                //"what happened while I was away", because it cannot say when
                //away began
    'cron',     //a job that failed
    'demo',     //the example app
    'example'   //the template plugin
];

//NOT KEPT, AND EACH FOR A REASON RATHER THAN BY OMISSION. All of these are
//weather: they say the app is alive, not that it did anything.
var NEVER = [
    'connection', 'connect', 'disconnect',//a client came and went
    'data',                                //what went over the wire
    'tick', 'ping', 'probe',               //a heartbeat, and things testing one
    'out'                                  //command output belongs to whatever ran it
];

//Enough to answer "what happened while I was away" without becoming an archive
//nobody reads. At roughly 150 bytes a line this is a few hundred kilobytes.
var MOST = 2000;

//---------------------------------------------------------------------------
//WHETHER A LINE IS ONE OF OURS TO KEEP.
//
//`never` IS ASKED FIRST, AND THAT ORDER IS THE WHOLE OF THIS FUNCTION.
//
//The app this came from checked its allowlist first and had a deny list it
//never reached: a socket entry is tagged ['vm', <name>, 'channel'], so `vm`
//being kept let every one of them through. 89 of 400 rows were one poll saying
//"reading its runs", and the answer to "what happened to runner1 while I was
//away" had scrolled out of the file.
//
//A RECORD THAT KEEPS THE HEARTBEAT AND DROPS THE ACTS IS WORSE THAN NONE,
//because it is trusted. So a denied tag anywhere on a line refuses it, whatever
//else the line also carries.
function worthKeeping(entry, policy) {
    if (!entry) return false;

    var keep = (policy && policy.keep) || KEEP;
    var never = (policy && policy.never) || NEVER;
    var tags = entry.tags || [];

    //MULTI-LINE OUTPUT IS A TRANSCRIPT, NOT AN ACT. `log.out` splits a command's
    //output into one entry per line, and a forty-line stack trace is forty rows
    //saying nothing about what the app decided.
    if (entry.level === 'out') return false;

    if (tags.some(function (t) { return never.indexOf(t) >= 0; })) return false;

    return tags.some(function (t) { return keep.indexOf(t) >= 0; });
}

//REDACTION AT THE BOUNDARY, which is the condition ../log/main.js set on any
//durable record existing at all -- see the `keeper` slot there, and the two
//profiles in ../log/looks-like.js.
function scrub(text) { return looksLike.redact(text, 'durable'); }

//WHAT GOES IN A ROW, AND NOTHING ELSE. A log entry carries an `id` that counts
//from 1 and resets with the process; keeping it here would be keeping a number
//that means something different in every row.
function row(entry, seq) {
    return {
        seq: seq,
        at: entry.at,
        level: entry.level,
        tags: entry.tags,
        text: scrub(entry.text)
    };
}

//---------------------------------------------------------------------------
//READING THE FILE BACK, WHICH IS TEXT AND SO BELONGS HERE.
//
//IT WAS IN ./main.js AND ONLY A RESTART COULD REACH IT. Both of the things this
//does are about surviving one -- a count that carries across, and a last line
//cut short by a process that was killed mid-write -- so a test inside the
//running app could not reach either without restarting it, and both sabotages
//survived. Text in, rows out: now they are answered in a millisecond.
function read(text) {
    var rows = [];
    var last = 0;

    String(text == null ? '' : text).split('\n').forEach(function (line) {
        if (!line.trim()) return;

        //A HALF-WRITTEN LAST LINE IS NOT CORRUPTION, it is the process having
        //been killed mid-write. Skipping it keeps everything before it, which is
        //the whole record minus one act -- where throwing would lose the lot and
        //read, from outside, as the app never having kept anything.
        try { rows.push(JSON.parse(line)); } catch (e) { /* the last one, cut short */ }
    });

    //THE COUNT COMES OUT OF THE ROWS, and rows written before it existed get one
    //in the order they are already in. Without that a listing ending on an old
    //row hands back a bookmark of null and the next read starts from the
    //beginning -- not wrong, but it reads as the record having forgotten where
    //you were.
    //
    //AND AN EXISTING COUNT IS KEPT, which is the whole reason a count is in the
    //file at all: renumbering on load would restart it with the process, and a
    //bookmark taken before a restart would then point into the middle of the
    //record rather than at the act it was taken from.
    rows.forEach(function (e) {
        if (!e.seq) e.seq = ++last;
        else last = Math.max(last, Number(e.seq) || 0);
    });

    return { rows: rows, last: last };
}

module.exports.read = read;
module.exports.worthKeeping = worthKeeping;
module.exports.scrub = scrub;
module.exports.row = row;
module.exports.KEEP = KEEP;
module.exports.NEVER = NEVER;
module.exports.MOST = MOST;
