//THE CLOCK, IN THE APP THAT IS RUNNING IT.
//
//What the schedule DECIDES is checked in ./node.test.js, against a fixed `now`,
//in a millisecond -- including the cases that would take a day to reach here.
//This is about the parts only a live app has: that there is a beat, that it
//turns, and that a job registered from a plugin is really on it.
//
//EVERY JOB HERE IS FORGOTTEN AFTERWARDS. This registers into the schedule of an
//app somebody is using, and one left behind would run for as long as the app
//does -- which is exactly the failure the plugin exists to make visible.

plugin.consumes = ['selftest', 'cron'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var cron = imports.cron;

    var made = [];

    function probe(spec) {
        spec.name = 'probe-' + spec.name + '-' + process.pid + '-' + made.length;
        made.push(spec.name);
        return cron.add(spec);
    }

    function tidy() {
        made.forEach(function (name) { cron.forget(name); });
        made.length = 0;
    }

    describe('the app clock', function () {

        it('has a beat, and it is a number of milliseconds', function () {
            assert.equal(typeof cron.BEAT, 'number');
            assert.ok(cron.BEAT > 0, 'the beat is ' + cron.BEAT);
        });

        it('takes a job and lists it', function () {
            try {
                probe({ name: 'listed', every: 60000, about: 'a probe' });

                var seen = cron.get(made[0]);
                assert.ok(seen, 'it is not there: ' + cron.list().map(function (j) { return j.name; }).join(','));
                assert.equal(seen.about, 'a probe');
                assert.equal(seen.running, false, 'it started itself');
                assert.equal(seen.armed, false, 'it claims to have work before any was given');
            } finally { tidy(); }
        });

        //`fire` IS THE ONE THING A PERSON ACTUALLY WANTS: run it now, whether or
        //not it is due, without touching whether it is switched on.
        it('runs a job on demand without switching it on', async function () {
            try {
                var name = probe({ name: 'fired', every: 60000 }).name;
                var ran = 0;

                var undo = cron.does(name, function () { ran++; return 'done'; });

                try {
                    assert.equal(await cron.fire(name), 'done');
                    assert.equal(ran, 1);
                    assert.equal(cron.get(name).running, false, 'firing switched it on');
                    assert.equal(cron.get(name).lastOk, true);
                } finally { undo(); }
            } finally { tidy(); }
        });

        //THE BEAT REALLY TURNS, which is the one claim no amount of pure testing
        //can make: ./node.test.js proves what is due, and this proves something
        //is asking.
        it('fires a due job on its own, without being asked', async function () {
            try {
                var name = probe({ name: 'beaten', every: 1, running: true, firstRun: 'now' }).name;
                var ran = 0;

                var undo = cron.does(name, function () { ran++; });

                try {
                    //waits for the app's own beat rather than a fixed sleep --
                    //`BEAT` is a setting, and a test that assumed a second would
                    //start failing the day somebody tuned it
                    var until = Date.now() + (cron.BEAT * 3) + 500;
                    while (ran === 0 && Date.now() < until) {
                        await new Promise(function (r) { setTimeout(r, 50); });
                    }

                    assert.ok(ran > 0, 'nothing ran within three beats -- the clock is not turning');
                } finally { undo(); }
            } finally { tidy(); }
        });

        //A SAVE MUST NOT FLIP THE SWITCH, which is the whole reason the schedule
        //lives in main while the work lives in the half that reloads.
        it('re-adding a job keeps whether it was running', function () {
            try {
                var name = probe({ name: 'kept', every: 60000 }).name;

                cron.start(name);
                assert.equal(cron.get(name).running, true);

                //the same registration a reloaded bundle would make
                cron.add({ name: name, every: 30000, about: 'after a save' });

                assert.equal(cron.get(name).running, true, 'a save switched it off');
                assert.equal(cron.get(name).every, 30000, 'the new interval was ignored');
            } finally { tidy(); }
        });

        it('stop and start are a switch, and say what they left it as', function () {
            try {
                var name = probe({ name: 'switched', every: 60000 }).name;

                assert.equal(cron.start(name), true);
                assert.equal(cron.stop(name), false);
                assert.equal(cron.get(name).running, false);
            } finally { tidy(); }
        });

        it('forgetting one takes it off the list', function () {
            var name = probe({ name: 'forgotten', every: 60000 }).name;

            assert.ok(cron.get(name), 'it was never there');
            assert.equal(cron.forget(name), true);
            assert.equal(cron.get(name), null, 'it is still listed');

            made.length = 0;//already gone
        });
    });

    register();
}
module.exports = plugin;
