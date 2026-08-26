var Drawers = require('./drawers');

//AN ANSWER SOMEBODY ALREADY WORKED OUT, SEEN FROM THE HALF THAT KEEPS
//RESTARTING.
//
//THE DRAWERS ARE MAIN'S AND ARE HANDED OVER, which is the whole point: this
//bundle is rebuilt on every save, so a cache kept here would be cold every time
//somebody is actually working. See ./main.js.
//
//WITHOUT A MAIN HALF IT MAKES ITS OWN, AND THIS IS THE ONE PLACE IN core THAT
//DOES THAT rather than refusing -- so it is worth saying why it is not the same
//mistake ../state and ../secret refuse to make.
//
//`state` refuses because state at a plausible wrong path is state the next start
//will not find. `secret` refuses because a stand-in that quietly wrote cleartext
//would look exactly like success. Both would be WRONG ANSWERS dressed as right
//ones.
//
//A CACHE WITH NOWHERE TO WRITE IS NOT A WRONG ANSWER, IT IS A COLD CACHE. Every
//door still works and still keeps its promise -- `byContent` is still true for
//ever, it just starts empty every time. That is a cache behaving exactly like a
//cache, and refusing here would mean a plugin that merely WANTS to be fast
//cannot be loaded at all.
//
//`persists` SAYS WHICH, so nothing has to infer it: false means nothing here
//survives a restart.

plugin.consumes = ['app'];
plugin.provides = ['cached'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.cached;

    if (real) return register(null, { cached: real });

    //THE REAL MODULE WITH NOWHERE TO PUT ANYTHING, not a stand-in for it. There
    //is no second implementation to keep in step -- `load` and `save` are simply
    //absent, which ./drawers.js already treats as a real answer.
    var drawers = Drawers();

    await register(null, {
        cached: Object.assign(drawers, {
            where: null,
            forgetEverything: function () { return 0; }
        })
    });
}
module.exports = plugin;
