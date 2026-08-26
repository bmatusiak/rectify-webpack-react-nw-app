//THE SAME SCHEDULE, FROM THE HALF THAT KEEPS RESTARTING.
//
//This one holds no timer and no jobs. ./main.js owns both, precisely because
//this half is rebuilt on every save -- a timer here would be torn down and
//rebuilt every few minutes, so anything counting in hours would never get there.
//
//WHAT A PLUGIN DOES FROM HERE is describe its job and supply the work:
//
//    var mine = cron.add({ name: 'sweep', every: 60000, about: 'tidy up' });
//    self.own(cron.does('sweep', async function () { ... }));
//
//`add` IS SAFE TO CALL AGAIN and that is the point -- re-registering on every
//reload keeps the job's history and its switch, because the description is code
//and the record is not. `does` hands back the way to take the work off again, so
//a reloading half undoes exactly what it did and the next one puts its own in.
//
//WITHOUT A MAIN HALF IT REFUSES, like ../state and unlike ../log. A schedule
//that silently accepted jobs and never ran them is the worst of the three
//possible behaviours: the app looks scheduled, nothing happens, and there is no
//error anywhere to find.

plugin.consumes = ['app'];
plugin.provides = ['cron'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.cron;

    if (real) return register(null, { cron: real });

    function noAnswer() {
        throw new Error(
            'There is no schedule in this process -- there is no main half behind it, and the one ' +
            'place the clock runs is core/cron/main.js. Nothing is accepted here on purpose: a job ' +
            'taken and never run is an app that looks scheduled and does nothing.');
    }

    await register(null, {
        cron: {
            add: noAnswer,
            does: noAnswer,
            forget: noAnswer,
            start: noAnswer,
            stop: noAnswer,
            fire: noAnswer,
            get: noAnswer,

            //LISTING IS THE ONE THING THAT ANSWERS. Anything drawing a screen
            //asks for the list before it asks for anything else, and an empty
            //schedule is the truth here -- there is nothing running.
            list: function () { return []; },
            get BEAT() { return 0; }
        }
    });
}
module.exports = plugin;
