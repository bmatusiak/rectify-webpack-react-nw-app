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
//AND `env` OVERRIDES THE MANIFEST, WHICH IS THE ONE THING HERE THAT IS ABOUT
//BEING ABLE TO TEST THIS AT ALL.
//
//Without it the closed branch could only be reached by `npm run dist` and
//`npm run drive -- --package` -- about four minutes -- so it would run roughly
//once a release. That is exactly the shape of every rule this codebase has
//already had to move out of a closure after its own sabotage survived. With it,
//`npm run drive -- --closed` is twenty seconds and the branch is exercised on
//every run somebody bothers to make.
//
//IT IS STILL BUILD TIME AND STILL NOT A RUNTIME SWITCH. This is read by
//../webpack.config.js and ./main.js and by nothing else -- whoever runs the
//build already controls everything, and the property that matters is untouched:
//the RUNNING app cannot open itself, because there is nothing left to flip.
//
//`process.env` IS AN ARGUMENT RATHER THAN REACHED FOR, the same way
//./app/core/dataDir/places.js takes `platform`, `env` and `home` -- so both
//answers can be asked for on one machine, which is the whole reason that file
//is shaped like that.
module.exports.decided = function decided(isProduction, manifest, env) {
    var said = env && env.APP_OPEN;

    //SAYING NOTHING IS NOT SAYING NO, and there are three ways to say nothing:
    //no `env` at all, the variable unset, and the variable set to empty. All
    //three have to fall through to the manifest, or every machine that has
    //never heard of this closes every build it makes.
    //
    //`if (said)` COVERS ALL THREE AND STILL CATCHES `APP_OPEN=0`, because '0'
    //is a non-empty string and therefore truthy -- which is the same fact that
    //makes reading the value loosely below unsafe, seen from the useful side.
    if (said) {
        //REFUSED RATHER THAN GUESSED AT, exactly like the manifest key below.
        //Every environment variable is a string, so `APP_OPEN=false` is truthy
        //-- reading it loosely would open a build somebody plainly meant to
        //close, which is the one direction that costs something.
        if (said === '1' || said === 'true') return true;
        if (said === '0' || said === 'false') return false;

        throw new Error('APP_OPEN is ' + JSON.stringify(said) + ', and it has to be '
            + '1, 0, true or false. Unset it to let package.json and the build mode decide.');
    }

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

//---------------------------------------------------------------------------
//AND WHETHER THIS BUILD PUTS THE DRIVER ON ITS OPEN LIST.
//
//A SECOND CONSTANT BECAUSE THE FIRST ONE CANNOT ANSWER IT. `BUILD_OPEN` says
//whether anything outside may drive the app AT ALL; this says whether a CLOSED
//build lists the four commands the driver arrives on -- `views`, `click`, `fill`
//and `read`. They are different questions and folding them together would mean
//a build that can be tested is a build that is open, which is the opposite of
//what is being tested.
//
//IT SHIPS OFF, and that is the point: a package built from this scaffold answers
//nothing on the control socket but `commands`, `health` and `may`. The names are
//not merely refused, they are not in the bundle -- webpack folds the branch out
//of ../src/config.js the same way it folds the routes out of a build that cannot
//serve.
//
//---- why it exists at all --------------------------------------------------
//
//BECAUSE SHIPPING SHUT MAKES THE SECOND LAYER UNTESTABLE, and the second layer
//is the one that does the protecting. A closed build shuts the door twice: the
//open list decides which COMMANDS answer, and the `Reachable` marks decide which
//CONTROLS the driver may touch. With the driver off the list, nothing can reach
//the page at all -- so `npm run drive -- --closed` and `--package` can prove the
//lock works and nothing whatever about the marks behind it.
//
//That is the exact rot this whole feature was written against, so the answer is
//a build you can drive rather than a default you can walk through.
//
//AND IT IS BUILD TIME, WHICH IS THE WHOLE REASON IT IS SAFE. A runtime flag that
//widened the open list would be the switch ./app/core/may/deciding.js exists to
//make impossible -- something running could turn the driver on. This cannot be
//turned on by anything running, because a build made without it does not contain
//the names.
module.exports.driveable = function driveable(env) {
    var said = env && env.APP_DRIVEABLE;

    //SAYING NOTHING IS SAYING NO, which is the opposite of ./decided above and
    //deliberately so. There, absent means "use the sensible default for this
    //mode"; here, absent means a shipped build, and a shipped build does not
    //hand out the driver.
    if (!said) return false;

    if (said === '1' || said === 'true') return true;
    if (said === '0' || said === 'false') return false;

    throw new Error('APP_DRIVEABLE is ' + JSON.stringify(said) + ', and it has to be '
        + '1, 0, true or false. Unset it for a build that ships shut.');
};
