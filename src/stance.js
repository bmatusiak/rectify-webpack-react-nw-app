//WHETHER THIS BUILD IS OPEN TO BEING DRIVEN, decided once and read by everything
//that has to agree about it.
//
//BUILD_OPEN IS A CONSTANT AND NOT A SETTING, for the reason ../CLAUDE.md already
//gives about `canServe`: a runtime flag can be flipped by whoever runs the app,
//and the thing being closed off here IS the runtime. A stance the command line
//can turn off is `guardSet --off` by another name -- the exact move
//./app/core/may/deciding.js exists to make impossible. webpack folds the open
//branches out of a closed build, so there is nothing left to flip.
//
//IT LIVES HERE RATHER THAN IN THE PLUGIN because ../webpack.config.js and
//./main.js both need the answer -- one for the three bundles and one for the
//boot nw reads off disk -- and ../CLAUDE.md warns that a build config reaching
//into a plugin by path is a plugin that cannot be moved. ./app/core/may/stance.js
//re-exports this and owns the runtime half; same cut as ./profile.js and
//./app/core/dataDir/places.js.
//
//TWO COPIES OF A DEFAULT is how a development build and its own window come to
//disagree about whether they are open, which is a bug with no symptom until
//something is quietly reachable.

//ABSENT MEANS DEVELOPMENT-OPEN, PACKAGED-CLOSED, which is the only default safe
//in the direction that matters: an app that has never heard of this key gets a
//working dev loop and a shut package.
//
//BOTH OVERRIDES EARN THEIR KEEP. `true` is a debug package -- one you can still
//drive, made on purpose. `false` is how the closed stance gets DEVELOPED
//against, in the three seconds a restart costs rather than the three minutes a
//`dist` does, which is the difference between a branch that is exercised and a
//branch that rots.
//
//A VALUE THAT IS NOT A BOOLEAN IS REFUSED, NAMING THE KEY, rather than falling
//back to the default. `"open": "false"` is a string and a string is truthy --
//reading it as the default would ship a build the manifest plainly meant to
//close. ./roots.js refuses a bad `srcDirs` the same way.
module.exports.decided = function decided(isProduction, manifest) {
    var app = manifest && manifest.app;

    if (app && app.open !== undefined) {
        if (typeof app.open !== 'boolean') {
            throw new Error('package.json "app": { "open" } is ' + JSON.stringify(app.open)
                + ', and it has to be true or false. Absent means open in development and '
                + 'closed when packaged.');
        }

        return app.open;
    }

    return !isProduction;
};
