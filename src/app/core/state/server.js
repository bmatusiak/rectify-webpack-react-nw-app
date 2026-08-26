//THE SAME DRAWER, FROM THE HALF THAT KEEPS RESTARTING.
//
//./main.js owns it, and ../build hands it over -- because two answers to "where
//does this live" is how the half that saves writes into one folder and the half
//that reads looks in another.
//
//WITHOUT A MAIN HALF IT REFUSES, the same as ../dataDir and for the same reason:
//what goes in here is the app's own, and a plausible wrong path is how something
//gets written where nobody will look for it. This is the opposite call from
//../log, which carries on -- losing a log line costs a line, and losing state
//costs whatever the app was told.

plugin.consumes = ['app'];
plugin.provides = ['state'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.state;

    if (real) return register(null, { state: real });

    function noAnswer() {
        throw new Error(
            'This process has nowhere to keep state -- there is no main half behind it, and the one ' +
            'place that owns the drawer is core/state/main.js. Nothing is guessed here on purpose: ' +
            'state written to a plausible wrong path is state the next start will not find.');
    }

    //THE WHOLE SURFACE, so a narrower stand-in cannot answer `undefined` where
    //it meant to refuse -- ../dataDir/server.js has the long version of why.
    await register(null, {
        state: {
            doc: noAnswer,
            names: noAnswer,
            get where() { return noAnswer(); }
        }
    });
}
module.exports = plugin;
