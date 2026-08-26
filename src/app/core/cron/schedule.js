//THE SCHEDULE ITSELF: what is due, what ran, and what it said.
//
//NO TIMER AND NO CLOCK OF ITS OWN. `now` is an argument to every function that
//needs one, and ./main.js is what has the `setInterval`. That is the whole
//reason ./node.test.js can ask "what is due in six hours" without waiting six
//hours, and why a job that runs daily is as testable as one that runs a second.
//
//THE POINT IS THE MONITORING, NOT THE SCHEDULING. A `setInterval` is one line.
//What is hard is a repeating job that can say when it last ran, how long it
//took, and what the failure said -- so every job keeps its last runs, and
//anything drawing a screen reads them from here.

var KEEP = 20;

module.exports = function makeSchedule(options) {
    options = options || {};

    var keep = options.keep || KEEP;
    var say = options.say || function () { return { info: noop, bad: noop, warn: noop }; };

    function noop() { }

    var jobs = Object.create(null);

    //---- registering ------------------------------------------------------
    //
    //CALLED AGAIN ON EVERY SAVE, and that is the case this has to get right.
    //The plugin that owns a job lives in the bundle that reloads, so it
    //re-registers every few minutes while somebody is working.
    //
    //SO RE-ADDING A NAME KEEPS ITS HISTORY AND ITS SWITCH. A save that reset
    //`running` would silently switch a job off -- or, worse, on -- and the whole
    //reason this lives in main is that a save must not do that.
    function add(spec, now) {
        var it = spec || {};
        var at = now === undefined ? Date.now() : now;
        var name = String(it.name || '').trim();

        if (!name) throw new Error('a scheduled job needs a name');

        var every = Number(it.every);
        if (!(every > 0)) throw new Error('"' + name + '" needs an interval in milliseconds');

        var had = jobs[name];

        if (had) {
            //WHAT THE NEW BUNDLE SAYS ABOUT THE SHAPE OF THE JOB WINS -- the
            //interval and the description are code, and code is what just
            //changed. What it must NOT touch is anything that HAPPENED.
            had.every = every;
            had.about = it.about || had.about;
            return had;
        }

        jobs[name] = {
            name: name,
            every: every,
            about: it.about || '',

            //`firstRun: 'now'` is for a job that should catch up the moment it is
            //switched on rather than waiting out a full interval -- a sweep that
            //notices something stale wants that; a nightly tidy does not.
            firstRun: it.firstRun === 'now' ? 'now' : 'later',

            running: it.running === true,

            //ANCHORED, NOT RELATIVE. `null` means "due at the next beat", which
            //is what `firstRun: 'now'` asks for. Anything else counts from the
            //moment the clock started -- and it has to be a FIXED moment, not
            //"now" re-read on every check, or the job is permanently one
            //interval into the future and never runs at all. Measured: a job
            //asking for a second was still not due a second and a half later.
            lastDueAt: it.firstRun === 'now' ? null : at,

            run: null,
            inFlight: false,
            runs: []
        };

        return jobs[name];
    }

    //`add` DESCRIBES THE JOB AND `does` SUPPLIES THE WORK, and they are separate
    //because the two have different lifetimes: the description survives a save,
    //the work does not. What to DO lives in the bundle and is replaced; the clock
    //keeps turning underneath it.
    function does(name, fn) {
        var job = jobs[name];
        if (!job) throw new Error('there is no scheduled job called "' + name + '"');

        job.run = fn || null;

        //hands back the way to take it off again, so a reloading half can undo
        //exactly what it did -- and only if it is still its own
        return function () { if (job.run === fn) job.run = null; };
    }

    function forget(name) {
        if (!(name in jobs)) return false;
        delete jobs[name];
        return true;
    }

    //---- the switch -------------------------------------------------------

    function start(name, now) {
        var job = jobs[name];
        if (!job) throw new Error('there is no scheduled job called "' + name + '"');

        if (!job.running) {
            job.running = true;

            //STARTED MEANS "FROM NOW", not "you are late". A job switched on
            //after being off for a day would otherwise be a day overdue and fire
            //the moment it was enabled, which reads as broken rather than as
            //punctual. `firstRun: 'now'` is the one that asks for the opposite.
            job.lastDueAt = job.firstRun === 'now' ? null : (now === undefined ? Date.now() : now);
        }

        return job.running;
    }

    function stop(name) {
        var job = jobs[name];
        if (!job) throw new Error('there is no scheduled job called "' + name + '"');

        job.running = false;
        return job.running;
    }

    //---- what is due ------------------------------------------------------

    function dueAt(job, now) {
        if (!job.running) return null;

        //`null` is "due at the next beat" -- `firstRun: 'now'`, and it has not
        //run yet. Everything else counts from the anchor set when the clock
        //started, which is why that anchor is a fixed moment rather than a
        //reading of the current time.
        if (job.lastDueAt === null) return now;

        return job.lastDueAt + job.every;
    }

    function due(now) {
        return Object.keys(jobs).filter(function (name) {
            var job = jobs[name];

            //IN FLIGHT IS NOT DUE. A run can take longer than its own interval
            //whenever anything is actually happening, and a second copy started
            //on top of the first is how one slow job becomes a pile of them.
            if (!job.running || job.inFlight) return false;

            var when = dueAt(job, now);
            return when !== null && now >= when;
        }).sort();
    }

    //---- running one ------------------------------------------------------

    async function fire(name, now) {
        var job = jobs[name];
        if (!job) throw new Error('there is no scheduled job called "' + name + '"');

        //THE CLOCK MOVES EVEN WHEN THERE IS NOTHING TO RUN. A job whose work has
        //not been supplied yet -- the bundle is mid-reload -- must not become
        //permanently overdue and fire a burst the moment it arrives.
        job.lastDueAt = now;

        if (typeof job.run != 'function') {
            record(job, { at: now, ms: 0, ok: false, why: 'nothing to run yet' });
            return null;
        }

        if (job.inFlight) return null;

        job.inFlight = true;
        var began = Date.now();

        try {
            var out = await job.run();
            record(job, { at: now, ms: Date.now() - began, ok: true });
            return out;
        } catch (e) {
            //A FAILING JOB IS RECORDED AND THE CLOCK KEEPS TURNING. Throwing out
            //of here would take the beat with it, and one broken job would stop
            //every other job in the app.
            record(job, { at: now, ms: Date.now() - began, ok: false, why: (e && e.message) || String(e) });
            say('cron', name).bad((e && e.message) || String(e));
            return null;
        } finally {
            job.inFlight = false;
        }
    }

    function record(job, run) {
        job.runs.push(run);
        if (job.runs.length > keep) job.runs.splice(0, job.runs.length - keep);
    }

    //ONE PASS OVER EVERYTHING DUE, awaited one at a time. Running them together
    //would make two jobs that touch the same thing each other's problem, and
    //nothing here is urgent enough to be worth that.
    async function beat(now) {
        var ran = due(now);
        for (var at = 0; at < ran.length; at++) await fire(ran[at], now);
        return ran;
    }

    //---- what somebody looks at -------------------------------------------

    function list(now) {
        return Object.keys(jobs).sort().map(function (name) { return get(name, now); });
    }

    function get(name, now) {
        var job = jobs[name];
        if (!job) return null;

        var last = job.runs[job.runs.length - 1] || null;

        return {
            name: job.name,
            about: job.about,
            every: job.every,
            running: job.running,
            inFlight: job.inFlight,

            //`nextAt` IS null WHEN IT IS NOT RUNNING, rather than a time in the
            //past -- a stopped job with a due date reads as overdue, which is a
            //different thing from switched off.
            nextAt: dueAt(job, now || Date.now()),

            //whether anything is behind it at all, which is not the same as
            //whether it is switched on
            armed: typeof job.run == 'function',

            lastAt: last ? last.at : null,
            lastMs: last ? last.ms : null,
            lastOk: last ? last.ok : null,
            lastWhy: last ? last.why : null,

            runs: job.runs.slice()
        };
    }

    return {
        add: add,
        does: does,
        forget: forget,
        start: start,
        stop: stop,
        due: due,
        fire: fire,
        beat: beat,
        list: list,
        get: get
    };
};

module.exports.KEEP = KEEP;
