//WHERE ANYTHING KEPT IS KEPT, SEEN FROM THE APP'S NODE HALF.
//
//It is worked out by ./main.js from `name` in package.json and handed over on
//the host -- because two answers to "where does it live" is how something gets
//written into one folder by the half that saves it and looked for in another by
//the half that reads it.
//
//WITHOUT A MAIN HALF THERE IS NO ANSWER, and this refuses rather than inventing
//one. A stand-in returning a temp folder would be worse than a refusal in the
//way that matters: whatever gets written lands somewhere plausible that nobody
//will think to look in, or to delete.
//
//THAT CASE IS REAL, not defensive. test/server-graph.test.js builds this half
//against a bare host with no main behind it, which is exactly the shape a
//refusal has to survive -- and it is why every caller should resolve its paths
//lazily. Asking at setup time turns a plugin that merely CAN store something
//into one that cannot be loaded at all.

plugin.consumes = ['app'];
plugin.provides = ['dataDir'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.dataDir;

    if (real) return register(null, { dataDir: real });

    //THE WHOLE SURFACE, NOT JUST `at`.
    //
    //./main.js publishes `path`, `from`, `profile`, `root`, `profiles`, `at`
    //and `ensure`. A stand-in narrower than the thing it stands in for answers
    //`undefined` where it meant to refuse -- `path.join(undefined, 'x')` throws
    //a TypeError about an argument, from a line that looks like it is about a
    //file, and the sentence below never gets said.
    //
    //GETTERS, because `path`, `from`, `profile` and `root` are values on the
    //real one and have to stay values here. Reading any of them throws what
    //calling `at()` throws.
    //
    //`profile` REFUSES RATHER THAN ANSWERING null, and it is the one that would
    //be tempting to soften: null is a real answer on the main side, meaning the
    //app's own directory. Saying it here would tell a caller "no profile" when
    //the truth is "this half cannot know", and those are different enough that
    //one of them belongs in a screen and the other in a bug report.
    function noAnswer() {
        throw new Error(
            'This process has no data directory -- there is no main half behind it, and the one ' +
            'place that works it out is core/dataDir/main.js. Nothing is guessed here on purpose: ' +
            'a plausible wrong path is how something gets written where nobody will look for it.');
    }

    await register(null, {
        dataDir: {
            at: noAnswer,
            ensure: noAnswer,
            profiles: noAnswer,
            get path() { return noAnswer(); },
            get from() { return noAnswer(); },
            get profile() { return noAnswer(); },
            get root() { return noAnswer(); }
        }
    });
}
module.exports = plugin;
