//---------------------------------------------------------------------------
//WHAT A PLUGIN HANDS TO ITS OWN OTHER HALF, ACROSS A RELOAD.
//
//The node bundle is rebuilt every time a file is saved. Anything a plugin must
//not forget when that happens lives in its `main.js`, and reaches its
//`server.js` through the host -- see ../build/main.js, which is what carries the
//host over.
//
//---- why this exists at all -----------------------------------------------
//
//../build NAMES THEM, ONE BY ONE. Its `consumes` lists every service whose main
//half it is carrying, and it builds the host object by hand. For core naming
//core that is right: they are core-to-core, and hiding them behind a lookup
//would make the host harder to read for nothing.
//
//BUT IT MEANS AN APP PLUGIN CANNOT CROSS THAT LINE WITHOUT EDITING CORE. A
//plugin in ../../../app_plugins with something to keep across a reload has to
//add its own name to core's `consumes` -- so core learns that an app service
//exists, and the plugin is no longer liftable. Take it to another project and it
//arrives with a strand still attached to a `core/build` that project does not
//have.
//
//THAT IS THE ONE COUPLING THIS SCAFFOLD CANNOT AFFORD. `src/app_plugins` exists
//to prove a feature can be removed without touching the app; a feature that
//needs a line in core to work is not removable, it is only undeployed.
//
//SO CORE PROVIDES THE CONTAINER AND NEVER LEARNS WHAT IS IN IT. Plugins put
//their own things in; ../build moves the whole box without opening it.
//
//---- the rule, which is now statable --------------------------------------
//
//  ../build names CORE services directly.
//
//  APP services arrive through here. `main.js` puts one in; `server.js` asks for
//  it by the same name off `app.host.of`.
//
//Nothing enforces which side a name is on, and nothing should. What IS enforced
//is that core's `consumes` lists carry no app names -- which is a thing
//test/handover.test.js can check and a person can see.
//---------------------------------------------------------------------------

plugin.consumes = [];
plugin.provides = ['handover'];
async function plugin(imports, register) {
    //A PLAIN OBJECT WITH THE PROTOTYPE CUT OFF. A name like `constructor` or
    //`toString` would otherwise come back as a function off Object's prototype,
    //and a lookup that answers with something plausible is worse than one that
    //answers nothing at all.
    var kept = Object.create(null);

    await register(null, {
        handover: {
            //PUT ONCE. A second plugin claiming a name it does not own is not a
            //merge and not a preference -- it is two things believing they are
            //the same one, which is exactly what a shared record must not allow.
            //It throws rather than warns, because the loser of a silent race
            //fails later, somewhere else, holding the wrong object.
            put: function (name, value) {
                var key = String(name || '').trim();
                if (!key) throw new Error('a handed-over service needs a name');

                if (key in kept) {
                    throw new Error('"' + key + '" is already handed over by another plugin. ' +
                        'Two things under one name is two answers to the same question.');
                }

                kept[key] = value;
                return value;
            },

            //UNDEFINED FOR A NAME NOBODY PUT, deliberately rather than a throw.
            //A server half asks for its own main half and has to be able to
            //carry on WITHOUT one: test/server-graph.test.js builds server
            //halves against a bare host, and every one of them has a stand-in
            //for that case. Throwing here would turn "there is no main behind
            //me" into "the app does not start".
            get: function (name) { return kept[String(name || '')]; },

            //WHAT IS BEING CARRIED -- for a person looking at the host, not for
            //anything that runs. A box nobody can see into is a box nobody can
            //debug.
            names: function () { return Object.keys(kept).sort(); }
        }
    });
}
module.exports = plugin;
