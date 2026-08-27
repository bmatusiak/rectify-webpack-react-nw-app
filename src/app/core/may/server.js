var deciding = require('./deciding');

//WHAT THIS APP IS ALLOWED TO DO, SEEN FROM THE HALF THAT KEEPS RESTARTING.
//
//IT IS MAIN'S AND IS HANDED OVER, for the reason that is the whole point: this
//bundle is rebuilt on every save, so answers kept here would be forgotten by
//every edit -- and "for this run" would mean "until you next press ctrl-s".
//
//WITHOUT A MAIN HALF IT REFUSES EVERYTHING GUARDED, which is the only honest
//answer and the one that costs least when it is wrong. ../cached carries on
//when there is no main because a cold cache loses nothing; ../state refuses
//because state at a wrong path is state the next start cannot find. This is
//further along that line again: a stand-in that allowed things would be a
//permission system that says yes when it has no idea.

plugin.consumes = ['app'];
plugin.provides = ['may'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.may;

    if (real) return register(null, { may: real });

    function nothingKnows(name) {
        return {
            allowed: false,
            why: 'nothing here knows whether ' + name + ' is allowed -- there is no main half '
                + 'behind this one, and the decisions live in core/may/main.js'
        };
    }

    function may(name) { return Promise.resolve(nothingKnows(name)); }

    await register(null, {
        may: Object.assign(may, {
            //`declare` IS A NO-OP RATHER THAN A REFUSAL. A plugin saying what it
            //thinks should be guarded is not asking for anything, and making
            //that throw would stop a plugin loading in a graph that merely
            //cannot answer -- which is the whole shape ../dataDir warns about.
            declare: function () { return function () { }; },

            //TRUE, NOT FALSE. `asks` is "would this need consent", and the
            //honest answer with no main behind us is yes -- saying no would
            //paint a control as unguarded and then refuse the press.
            asks: function () { return true; },

            decide: function () {
                return {
                    refused: 'a decision cannot be made from the node half -- open the window and '
                        + 'answer there. A guard the command line can remove is not a guard.'
                };
            },

            decisions: function () { return []; },
            ANSWERS: deciding.ANSWERS
        })
    });
}
module.exports = plugin;
