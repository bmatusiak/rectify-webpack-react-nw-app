var looksLike = require('./looks-like');

//---------------------------------------------------------------------------
//ONE LIVE LOG, TAGGED, THAT EVERYTHING WRITES INTO.
//
//TAGS RATHER THAN LEVELS OR SEPARATE FILES, because the question a person
//actually asks is "what happened with the build" or "what did ipc do", and that
//is a FILTER, not a place to go looking. Every line carries where it came from,
//so this is one stream you narrow rather than several you correlate.
//
//IT IS IN main.js AND NOT server.js, WHICH IS THE WHOLE POINT ON THIS SCAFFOLD.
//The node half is rebuilt and re-run every time a file is saved -- so a log kept
//there is emptied several times a minute during ordinary development, and
//"what happened just before that broke?" is unanswerable exactly when it is
//being asked. main is loaded once and never reloads. Same argument that already
//puts the window, the tray and the ipc handler table on this side.
//
//IT IS IN MEMORY ON PURPOSE, AND THE REASON IS CREDENTIALS. `out()` exists to
//take command output, and command output carries tokens, sign-in urls and
//whatever a subprocess decided to print. Writing this stream to a file would put
//all of that on disk in cleartext, in a file nothing treats as a secret.
//
//So the cost is accepted and it is a real one: a restart loses the record. A
//durable record is not an append call added here -- it needs redaction at the
//boundary and a decision about where it lives, and `keeper` below is the one
//seam it may arrive through.
//
//WHAT THIS IS NOT is nw.log. That file is everything chromium and node printed,
//noise included, and `npm run log` reads it from outside the app. This is what
//the app deliberately recorded, tagged and filterable, from inside. Lines here
//are mirrored to the console so they reach that file too -- one story, not two.
//---------------------------------------------------------------------------

//A RING, NOT A LIST. An app left running for a day would otherwise hold every
//line it ever wrote, and the oldest are the ones nobody is asking about.
var MAX = 2000;

plugin.consumes = [];
plugin.provides = ['log'];
async function plugin(imports, register, config) {
    config = config || {};

    var entries = [];
    var listeners = [];
    var keep = null;
    var nextId = 1;

    var limit = config.max || MAX;
    var toConsole = config.console !== false;

    function add(tags, text, level) {
        //REDACTED BEFORE IT IS ANYWHERE, not before it is read. The window draws
        //this, a screenshot photographs it, and `since` hands it to whoever
        //asks -- redacting at one of those is redacting at one of three.
        var line = looksLike.redact(text);

        var entry = {
            id: nextId++,
            at: Date.now(),
            level: level || 'info',
            tags: (tags || []).filter(Boolean),
            text: line
        };

        entries.push(entry);
        if (entries.length > limit) entries.splice(0, entries.length - limit);

        //MIRRORED, SO nw.log AND `npm run log` STILL SEE IT. A line that exists
        //only in memory is one that a crash takes with it -- and the crash is
        //when somebody wants it most.
        if (toConsole) {
            var say = entry.level === 'bad' ? console.error : console.log;
            say('[' + entry.tags.join(' ') + '] ' + entry.text);
        }

        listeners.slice().forEach(function (fn) {
            try { fn(entry); }
            catch (e) { /* a watcher that throws must not stop the log */ }
        });

        if (keep) {
            try { keep(entry); }
            catch (e) { /* nor may the durable record, if there ever is one */ }
        }

        return entry;
    }

    //A LOGGER WITH ITS TAGS ALREADY ON IT, so callers never have to remember to
    //tag consistently -- untagged lines are the ones that make a filter useless,
    //and they are what you get when tagging is a thing to remember at every call.
    function on() {
        var tags = [].slice.call(arguments);

        function said(level) {
            return function (text) {
                return add(tags.concat([].slice.call(arguments, 1)), text, level);
            };
        }

        return {
            info: said('info'),
            good: said('good'),
            warn: said('warn'),
            bad: said('bad'),

            //multi-line command output, split so each line can be filtered on
            //its own -- a forty line stack as one entry is one thing to scroll
            //past rather than forty things to search
            out: function (text) {
                var more = [].slice.call(arguments, 1);
                String(text).split('\n')
                    .filter(function (l) { return l.trim(); })
                    .forEach(function (l) { add(tags.concat(more), l, 'out'); });
            },

            //narrower still, for a sub-part of whatever this is
            on: function () { return on.apply(null, tags.concat([].slice.call(arguments))); }
        };
    }

    //EVERYTHING AFTER AN ID -- UNLESS THAT ID IS FROM A LOG THAT NO LONGER EXISTS.
    //
    //Ids count from 1 and reset when this log does, because it is in memory and
    //is about what is happening NOW. So a watcher that reconnects afterwards asks
    //for "everything after 412" of a log whose newest line is 3, and is answered
    //with nothing, for ever: connected, healthy, and never printing another line.
    //That is worse than dropping out, because it looks exactly like a quiet
    //system.
    //
    //An id higher than anything here cannot be one of ours, so it is read as
    //"start again" rather than as a filter -- which is the honest answer, since
    //this log did just begin.
    function since(id) {
        var from = Number(id || 0);
        var newest = entries.length ? entries[entries.length - 1].id : 0;

        if (from > newest) return entries.slice();
        return entries.filter(function (e) { return e.id > from; });
    }

    //Every tag in the log right now, with how many lines carry it. Anything
    //drawing filters builds them from this rather than from a hardcoded list, so
    //a new tag anywhere shows up as a filter without being registered.
    function tags() {
        var count = {};

        entries.forEach(function (e) {
            e.tags.forEach(function (t) { count[t] = (count[t] || 0) + 1; });
        });

        return Object.keys(count)
            .map(function (t) { return { tag: t, n: count[t] }; })
            .sort(function (a, b) { return b.n - a.n; });
    }

    await register(null, {
        log: {
            add: add,
            on: on,
            since: since,
            tags: tags,

            subscribe: function (fn) {
                listeners.push(fn);
                return function () {
                    listeners = listeners.filter(function (x) { return x !== fn; });
                };
            },

            clear: function () { entries.length = 0; },
            all: function () { return entries.slice(); },

            //THE ONE SEAM A DURABLE RECORD MAY ARRIVE THROUGH, rather than an
            //append call added above. Whatever takes this on is deciding where
            //credentials end up living, which is a decision that deserves its
            //own plugin and its own argument.
            keeper: function (fn) {
                keep = fn;
                return function () { if (keep === fn) keep = null; };
            }
        }
    });
}
module.exports = plugin;
