var fs = require('node:fs');

//---------------------------------------------------------------------------
//AN ANSWER SOMEBODY ALREADY WORKED OUT, AND THE RULE FOR WHEN IT MAY BE REUSED.
//
//THE RULE IS THE WHOLE FILE: key on something that changes when the answer
//changes. Never on a clock. The app this came from arrived at that three
//separate times in three different subjects and wrote it down each time -- "there
//is no window during which the file is new and the answer is old".
//
//SO THERE ARE THREE DOORS AND NOT ONE, and which one a caller takes says what
//its key is made of. That is the point of having three: a reader can see from
//the call which promise is being made, instead of finding out from a stale panel.
//
//    byContent   the key contains the thing itself -- two shas, a hash. The
//                answer is a pure function of the key, so it is true for ever,
//                so it is the only kind worth writing to disk.
//
//    byStamp     the key is a file's `mtimeMs:size`, worked out here rather than
//                by the caller. Same promise, but NEVER written down: what this
//                kind holds is derived from a file, and that file may be a
//                secret. A persisted copy of an unsealed secret is a worse bug
//                than every call this saves.
//
//    whileFresh  keyed on a clock, because there is nothing else to key on. The
//                only honest use is "no single draw asks twice" -- a second, not
//                a minute -- and it MUST be dropped when something writes, which
//                is what `stale()` is for.
//
//WHY THE THIRD EXISTS AT ALL, given the rule it breaks. Sometimes checking
//whether the cached answer is still good costs exactly what the answer costs, so
//there is nothing to key on that is cheaper than just asking. What is left is to
//make the window small enough that nothing can happen inside it, and to close it
//by hand on any write. That is a de-duplicator wearing a cache's clothes, and
//calling it `whileFresh` rather than `cache` is the only way to keep the
//difference visible at the call site.
//
//---- what a counter here can and cannot tell you --------------------------
//
//`stats()` counts hits, misses and shares. The worst cache failure this idea has
//had is invisible to it, so it is worth saying which one:
//
//A BOARD IN THE APP THIS CAME FROM CACHED CORRECTLY AND SAVED NOTHING. Building
//the key cost four git processes per branch, and they ran on a HIT as well as a
//miss -- so the heavy call really was skipped, the hit rate really was high, and
//the timing never moved. No counter in here could have caught it, because
//everything it measures was healthy. What catches it is counting what the CALLER
//spawns, from outside. A drawer reporting 95% hits is not evidence that anything
//got faster.
//---------------------------------------------------------------------------

//HOW MANY ANSWERS A DRAWER KEEPS BEFORE IT DROPS THE LOT.
//
//A WIPE RATHER THAN AN LRU, and that is deliberate: nothing in here is expensive
//to work out ONCE, the bookkeeping an LRU needs is per-get rather than
//per-evict, and a cache that needs a data structure to decide what to forget has
//stopped being the cheap thing it was supposed to be. Five hundred is far more
//than a session reaches.
var KEEP = 500;

//A FILE'S IDENTITY, AS FAR AS ANYTHING HERE IS CONCERNED.
//
//`mtimeMs:size` AND NOT A HASH OF THE CONTENT, which would be the honest key and
//costs a full read -- turning a cache lookup into the thing it exists to avoid.
//Size is in it because mtime alone has a resolution, and two writes inside one
//tick with the same length is the case it misses.
//
//A FILE THAT IS NOT THERE IS ITS OWN STAMP rather than a throw: "there is no
//such file" is a perfectly good thing to remember, and it changes the moment
//somebody creates one.
function stampOf(file) {
    try {
        var s = fs.statSync(file);
        return s.mtimeMs + ':' + s.size;
    } catch (e) {
        return 'gone';
    }
}

module.exports = function Drawers(opts) {
    opts = opts || {};

    var keep = opts.keep || KEEP;

    //A CLOCK IS AN ARGUMENT, the same as ../cron -- otherwise the only way to
    //test a window is to wait for one, and a test that waits is a test that is
    //slow when it passes and flaky when it does not.
    var clock = opts.now || Date.now;

    //WHERE A byContent DRAWER IS WRITTEN DOWN, or nothing. Absent is a real
    //answer here: every drawer still works, it just starts empty on every start,
    //which is a cache behaving like a cache. ../state refuses in that position
    //instead, and the difference between the two IS the difference between a
    //cache and a record.
    var load = opts.load || null;
    var save = opts.save || null;

    var drawers = [];
    var counts = { hit: 0, miss: 0, share: 0, wiped: 0 };

    function drawer(name, kind, window) {
        var answers = new Map();
        var flying = new Map();

        //WHETHER THIS DRAWER IS ONE THAT REACHES DISK, DECIDED IN ONE PLACE.
        //
        //IT WAS DECIDED IN TWO -- once where `save` is called and once inside
        //`written` -- and the second was dead: breaking it changed nothing,
        //because the first already refused. A rule written twice is a rule where
        //one copy can be wrong without anything noticing, and that copy is the
        //one somebody edits.
        //
        //THE RULE ITSELF: only a content-keyed drawer. A stamp-keyed one holds
        //something derived from a file, and that file may be a sealed
        //credential -- a persisted copy of an unsealed secret is a worse bug
        //than every call this saves. A clock-keyed one is meaningless the moment
        //the process ends.
        function persisted() { return kind === 'byContent' && !!save; }

        var mine = {
            name: name,
            kind: kind,

            //ONE COMPUTATION FOR CONCURRENT ASKERS. Two callers wanting the same
            //key at the same moment is the ordinary case when a page draws --
            //without this the expensive thing runs twice and both callers wait
            //for their own copy of it.
            get: async function (key, make) {
                var at = mine.keyFor(key);

                if (answers.has(at)) {
                    var found = answers.get(at);

                    if (!window || (clock() - found.at) < window) {
                        counts.hit++;
                        return found.value;
                    }

                    //past its window, which is only ever a whileFresh drawer
                    answers.delete(at);
                }

                if (flying.has(at)) {
                    counts.share++;
                    return flying.get(at);
                }

                counts.miss++;

                var working = Promise.resolve()
                    .then(function () { return make(); })
                    .then(function (value) {
                        mine.put(at, value);
                        return value;
                    })
                    .finally(function () { flying.delete(at); });

                flying.set(at, working);
                return working;
            },

            //THE KEY, MADE THE WAY THIS KIND OF DRAWER MAKES ONE -- so a
            //byStamp drawer is handed a PATH and does the stamping itself.
            //Leaving that to the caller is how two call sites come to stamp the
            //same file differently and quietly keep two answers for it.
            keyFor: function (key) {
                return kind === 'byStamp' ? String(key) + '@' + stampOf(key) : String(key);
            },

            put: function (at, value) {
                //A WIPE, NOT AN EVICTION -- see the header.
                if (answers.size >= keep) { answers.clear(); counts.wiped++; }

                answers.set(at, { value: value, at: clock() });
                if (persisted()) save(name, mine.written());
                return value;
            },

            forget: function (key) { return answers.delete(mine.keyFor(key)); },
            clear: function () {
                answers.clear();
                if (persisted()) save(name, []);
            },

            get size() { return answers.size; },

            //WHAT WOULD BE WRITTEN DOWN, IF THIS IS A DRAWER THAT IS. The rule
            //is `persisted` above and is asked there, not restated here.
            written: function () {
                if (!persisted()) return [];
                return [...answers.entries()].map(function (e) { return [e[0], e[1].value]; });
            }
        };

        //AND READ BACK, for the one kind that is true for ever
        if (kind === 'byContent' && load) {
            (load(name) || []).forEach(function (pair) {
                answers.set(pair[0], { value: pair[1], at: clock() });
            });
        }

        drawers.push(mine);
        return mine;
    }

    return {
        byContent: function (name) { return drawer(name, 'byContent'); },
        byStamp: function (name) { return drawer(name, 'byStamp'); },

        //A WINDOW IN MILLISECONDS, AND THE DEFAULT IS A SECOND. Not a minute:
        //the only honest use of this door is "no single draw asks twice", and a
        //window long enough to span two things a person did is a window long
        //enough to be wrong in.
        whileFresh: function (name, window) { return drawer(name, 'whileFresh', window || 1000); },

        //SOMETHING WROTE, SO EVERY CLOCK-KEYED ANSWER IS SUSPECT.
        //
        //IT LEAVES THE OTHER TWO ALONE, and that is the point rather than an
        //oversight: a content-keyed answer cannot be wrong -- the key contains
        //the thing -- and a stamp-keyed one notices on its own the next time it
        //is asked. Wiping those on every write would throw away exactly the
        //answers that are still true.
        stale: function () {
            var dropped = 0;

            drawers.forEach(function (one) {
                if (one.kind !== 'whileFresh') return;
                dropped += one.size;
                one.clear();
            });

            return dropped;
        },

        stats: function () {
            return {
                hit: counts.hit, miss: counts.miss, share: counts.share, wiped: counts.wiped,
                drawers: drawers.map(function (one) {
                    return { name: one.name, kind: one.kind, size: one.size };
                })
            };
        },

        //so a caller can say whether any of this survives a restart, rather than
        //assuming it from the platform
        get persists() { return !!save; }
    };
};

module.exports.KEEP = KEEP;
module.exports.stampOf = stampOf;
