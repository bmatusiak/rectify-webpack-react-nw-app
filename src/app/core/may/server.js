var deciding = require('./deciding');
var Stance = require('./stance');

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
async function plugin(imports, register, config) {
    var real = imports.app.host && imports.app.host.may;

    if (real) return register(null, { may: real });

    //---- except the stance, which this half can answer for itself ----------
    //
    //IT IS NOT MAIN'S TO KNOW AND OURS TO ASK FOR. A DECISION needs main -- it
    //is written down there, and "for this run" means main's run. The stance
    //needs nothing: BUILD_OPEN is a constant webpack folded into this bundle
    //and the list is in ../../../config.js, which every context has.
    //
    //SO REFUSING IT WOULD BE FALSE PRUDENCE, and expensive. A graph with no main
    //behind it -- test/server-graph.test.js is one -- would report that it
    //reaches nothing, and ../../../app_plugins/mcp would list no tools at all:
    //an app that looks broken rather than one that looks shut.
    var mine = Stance.of(BUILD_OPEN, config && config.may && config.may.open);

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

            //AND THE STANCE, ANSWERED PROPERLY. See the note above `mine`: this
            //is the one thing here that does not need main, so it is the one
            //thing here that is not a refusal.
            reaches: function (kind, name) { return mine.reaches(kind, name); },
            stale: function (kind, present) { return mine.stale(kind, present); },
            stance: mine.open ? 'open' : 'closed',

            reach: function () {
                return {
                    open: mine.open, closed: mine.closed, unreadable: mine.unreadable,
                    lists: mine.lists, stale: {}, counts: {}
                };
            },

            decide: function () {
                return {
                    refused: 'a decision cannot be made from the node half -- open the window and '
                        + 'answer there. A guard the command line can remove is not a guard.'
                };
            },

            //AND THE SAME SENTENCE FOR TAKING ONE BACK. It is refused for the
            //same reason it is refused over the wire: forgetting is a decision,
            //and this half is not a person at a window either.
            forget: function () {
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
