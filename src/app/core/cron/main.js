var makeSchedule = require('./schedule');

//---------------------------------------------------------------------------
//EVERYTHING THIS APP DOES ON A TIMER, IN ONE PLACE THAT CAN BE LOOKED AT.
//
//THE POINT IS THE MONITORING, NOT THE SCHEDULING. A `setInterval` is one line;
//what is hard is a repeating job that can say when it last ran, how long it
//took, and what the failure said. A timer nobody can see is a timer that is
//either working or has been silently dead for a week, and there is no way to
//tell which.
//
//---- why this is main.js --------------------------------------------------
//
//THE NODE BUNDLE IS REBUILT EVERY TIME A FILE IS SAVED. A timer that lived over
//there would be torn down and rebuilt every few minutes -- so anything counting
//in hours would never get there, and the record of what has run would reset
//while somebody was reading it.
//
//Same argument that already puts the window, the tray, the ipc handler table
//and ../log on this side. See ../build/main.js.
//
//AND THE WORK ITSELF IS PUT IN RATHER THAN HELD -- see ./schedule.js. `add`
//describes the job and `does` supplies the work, because the two have different
//lifetimes: what to DO lives in the bundle and is replaced, and the clock keeps
//turning underneath it.
//---------------------------------------------------------------------------

//HOW OFTEN THE ONE TIMER LOOKS, which is not how often anything runs.
//
//ONE TIMER FOR THE WHOLE APP rather than one per job, because the interesting
//question -- "what is due" -- is then answered in one place against one clock,
//and a job registered while stopped needs no timer at all.
//
//A SECOND IS FINE AND THE ARITHMETIC IS WHY: a beat compares a few numbers and
//returns. The cost of a coarser one is that a job asking for fifteen seconds
//gets fifteen and a bit, and nothing here needs better than that.
var BEAT = 1000;

plugin.consumes = ['log', 'Plugin'];
plugin.provides = ['cron'];
async function plugin(imports, register, config) {
    config = config || {};

    var self = new imports.Plugin('cron');
    var schedule = makeSchedule({ say: imports.log.on, keep: config.keep });

    var every = config.beat || BEAT;
    var beating = false;

    var timer = setInterval(function () {
        //THE BEAT DOES NOT OVERLAP ITSELF. `beat` awaits each job in turn, so a
        //job that takes longer than a second would otherwise have a second beat
        //start on top of it -- and `due` would hand the same work out twice
        //before the first had marked itself in flight.
        if (beating) return;

        beating = true;
        Promise.resolve(schedule.beat(Date.now()))
            .catch(function (e) {
                //nothing in beat() should throw -- fire() records failures
                //rather than raising them -- so this is the last resort, and it
                //must not stop the clock
                imports.log.on('cron').bad('the beat threw: ' + ((e && e.message) || e));
            })
            .then(function () { beating = false; });
    }, every);

    //A TIMER OUTLIVES THE THING THAT MADE IT unless somebody says otherwise, and
    //a scaffold that left one running would keep beating against a torn-down
    //schedule for as long as the process lived.
    self.own(function () { clearInterval(timer); });

    await register(null, {
        cron: self.api({
            BEAT: every,

            //---- what a plugin does ----------------------------------------
            add: schedule.add,
            does: schedule.does,
            forget: schedule.forget,

            //---- and what a person does ------------------------------------
            start: schedule.start,
            stop: schedule.stop,

            //---- and what a person sees ------------------------------------
            list: function () { return schedule.list(Date.now()); },
            get: function (name) { return schedule.get(name, Date.now()); },

            //FOR A DRILL, AND FOR THE ONE THING A PERSON ACTUALLY WANTS: run it
            //now, whether or not it is due, without touching whether it is
            //switched on.
            fire: function (name) { return schedule.fire(name, Date.now()); }
        }),
        onDestroy: self.unload
    });
}
module.exports = plugin;
module.exports.BEAT = BEAT;
