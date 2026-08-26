var fs = require('node:fs');
var path = require('node:path');

var keeping = require('./keeping');

//---------------------------------------------------------------------------
//WHAT THIS APP HAS DONE, KEPT ACROSS RESTARTS.
//
//../log DELIBERATELY DOES NOT DO THIS, and its own header says why at length:
//command output goes through it, command output carries sign-in urls and tokens
//being placed, and a file of that is a credential store nothing treats as one.
//That decision stands. This is the other half it asks for -- redaction at the
//boundary, and a decision about where it lives -- and it arrives through the
//one `keeper` slot that file leaves open rather than through an append call
//added next to a logger.
//
//WHAT IT IS FOR. This app restarts every few minutes while it is being worked
//on, and everything that happened before the restart went with it. So "I
//restarted it, then changed the config" left no trace of either, and anybody
//reading afterwards -- a person coming back, or a model that was not watching --
//filled the gap with whatever they expected.
//
//IT IS NOT A SECOND LOG. The log holds thousands of lines and answers "what is
//happening"; this holds hundreds and answers "what was DONE". Anything that
//makes, destroys, starts or stops something.
//
//NO SERVER HALF OF ITS OWN WORTH THE NAME. ./server.js exists only to hand over
//what main owns -- like ../state and ../secret -- because the node half restarts
//constantly and a record that restarted with it would be answering the question
//it exists to answer with "I do not know".
//---------------------------------------------------------------------------

plugin.consumes = ['log', 'dataDir', 'ipc'];
plugin.provides = ['events'];
async function plugin(imports, register, config) {
    var log = imports.log;
    var dataDir = imports.dataDir;

    //THE POLICY IS THE APP'S, AND THIS IS THE LINE BETWEEN MECHANISM AND LOGIC.
    //
    //The app this came from hardcodes its own vocabulary -- `task`, `queue`,
    //`vm`, `github`, `supervisor` -- in the plugin. That is its logic living in
    //core, and it is why the same list could not be carried over: nothing in
    //this scaffold has a `vm`. So the shape comes here and the words come from
    //src/config.js, keyed by service name like every other plugin's.
    var policy = {
        keep: (config && config.keep) || keeping.KEEP,
        never: (config && config.never) || keeping.NEVER,
        most: (config && config.most) || keeping.MOST
    };

    var FILE = 'events.jsonl';

    //RESOLVED LAZILY, like ../state -- ../dataDir refuses when there is no main
    //half, and asking at setup would turn "cannot keep a record" into "will not
    //load".
    function where() { return path.join(dataDir.at('state'), FILE); }

    var kept = null;

    //THE HIGHEST COUNT EVER WRITTEN, kept across restarts by being IN the rows.
    //Derived on load rather than stored beside them: two places holding the same
    //number is two places to disagree, and the rows are the record.
    var last = 0;

    //THE PARSING IS IN ./keeping.js, not here. Both things it does are about
    //surviving a restart -- carrying the count across, and skipping a last line
    //a killed process cut short -- so nothing inside a running app could reach
    //either without restarting it, and both of their sabotages survived. What is
    //left here is the file, which is all this function should ever have been.
    function load() {
        if (kept) return kept;

        var text;
        try { text = fs.readFileSync(where(), 'utf8'); }
        catch (e) { kept = []; return kept; }//nothing kept yet, or nowhere to keep it

        var back = keeping.read(text);

        kept = back.rows;
        last = back.last;

        return kept;
    }

    //REWRITTEN WHOLE RATHER THAN APPENDED TO, because the cap has to hold and a
    //file that only grows is what makes somebody delete the lot. At two thousand
    //lines this is cheap, and it happens on an act rather than on a timer.
    function write() {
        try {
            var file = path.join(dataDir.ensure('state'), FILE);
            var beside = file + '.writing';

            fs.writeFileSync(beside, kept.map(function (e) { return JSON.stringify(e); }).join('\n') + '\n');
            fs.renameSync(beside, file);
        } catch (e) {
            //THE ACT STILL HAPPENED; only the note is lost. Throwing here would
            //mean a log line that could not be written down took down whatever
            //was doing the thing worth writing down.
        }
    }

    function keep(entry) {
        if (!keeping.worthKeeping(entry, policy)) return null;

        load();

        //A COUNT AS WELL AS A TIME, AND THE COUNT IS WHAT A BOOKMARK IS MADE OF.
        //
        //`at` is milliseconds, and two acts in one millisecond is not a rare
        //case -- a plugin that stops one thing and starts another writes both
        //immediately. Bookmarking on a timestamp then loses the second of them
        //FOR EVER: it is not greater than the mark, so it never comes back, and
        //a watcher following along simply never learns it happened.
        //
        //../log solved the same problem with ids and can let them reset, because
        //it is memory. This cannot, so the count goes in the file.
        var made = keeping.row(entry, ++last);

        kept.push(made);
        if (kept.length > policy.most) kept.splice(0, kept.length - policy.most);

        write();
        return made;
    }

    //Newest last, the way the log reads.
    function all(opts) {
        var o = opts || {};
        var rows = load();

        if (o.since !== undefined && o.since !== null && o.since !== '') {
            var from = Number(o.since) || 0;
            rows = rows.filter(function (e) { return (Number(e.seq) || 0) > from; });
        }

        if (o.tag) {
            rows = rows.filter(function (e) { return (e.tags || []).indexOf(o.tag) >= 0; });
        }

        return rows.slice(-Math.max(1, Math.min(policy.most, Number(o.limit) || 200)));
    }

    //THE ONE SEAM, TAKEN HERE rather than reached for from the log's side.
    var unkeep = log.keeper(keep);

    var command = imports.ipc.handle('events', function (data) {
        var said = data || {};
        var rows = all({ since: said.since, limit: said.limit, tag: said.tag });

        return {
            events: rows,

            //A BOOKMARK: reading the whole record every time is how a watcher
            //spends its attention re-reading what it already knows.
            bookmark: rows.length ? rows[rows.length - 1].seq : (said.since || null),

            where: where(),
            keeping: policy.keep.join(', '),

            note: rows.length
                ? 'What this app has done. Command output and anything tagged as weather are '
                    + 'deliberately not here -- the live log has those, while it lasts.'
                : 'Nothing kept yet.'
        };
    });

    await register(null, {
        events: {
            keep: keep,
            all: all,

            clear: function () { kept = []; write(); },

            get where() { return where(); },
            get policy() { return policy; },

            //WHETHER ANY OF THIS IS REALLY BEING WRITTEN DOWN. ./server.js
            //answers false when there is no main half behind it, and it carries
            //on rather than refusing -- so without one word to ask, a caller
            //cannot tell a record that is empty from one that is not being kept,
            //and those are opposite answers to "did that get recorded".
            kept: true,

            //exposed so a caller can ask the rule without writing anything,
            //and so ./node.test.js has one thing to require
            worthKeeping: function (entry) { return keeping.worthKeeping(entry, policy); },
            scrub: keeping.scrub
        },

        onDestroy: function () {
            unkeep();
            command.remove();
        }
    });
}
module.exports = plugin;
