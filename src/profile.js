//WHICH SET OF DATA THIS RUN IS WORKING ON.
//
//Shared by both main boots so they cannot disagree about it, and kept out of
//src/config.js for the same reason src/serve.js is: config.js is a bundled
//source file, and a packaged app that has to be rebuilt to be reconfigured is
//not configurable.
//
//TWO WAYS TO SAY IT, AND THE FLAG WINS:
//
//    package.json   "app": { "profile": "demo" }
//    argv           --profile=test           this run keeps its things apart
//                   --no-profile             the app's own, whatever the manifest says
//
//WHAT IT ACTUALLY DOES is move ../src/app/core/dataDir's directory, and
//everything roots under that -- state, secrets, and whatever a plugin puts
//there. So one flag gives a run its own world, and no plugin has to know the
//feature exists.
//
//---- this is NOT the same thing as a workspace ----------------------------
//
//The two get confused because both are "namespaces", and building one when you
//wanted the other is expensive to undo.
//
//    a profile     changes the ROOT. EVERYTHING moves, including the things
//                  that are true whatever is being worked on. Decided once, at
//                  boot, because a process cannot be halfway between two data
//                  directories.
//
//    a workspace   changes a DRAWER. Some things move and some must not -- the
//                  list of workspaces and which one is open cannot live inside
//                  the workspace, or you could not switch back. Decided at
//                  runtime, repeatedly. See ./app/core/state's `here`.
//
//A profile is for `--profile=test`: leave my real data alone. A workspace is
//for "I have three projects open". Neither is expressible as the other.
//
//---- a bad name is refused, and this is the one place it must be ----------
//
//src/serve.js prints a complaint and falls back to serving somewhere sensible,
//because the cost of getting that wrong is a port nobody wanted. The cost here
//is different in kind: falling back means the run that ASKED to be kept apart
//writes into the real data instead, and `--profile=test` quietly becoming "no
//profile" is how a test run eats what somebody was working on.
//
//So it throws, and the boot's own catch prints it and exits.

//A NAME, NOT A PATH -- the same rule ./app/core/state uses for a document, and
//for the same reason: this becomes a directory. A deny list is a list somebody
//has to have got right, and there is no reading of `../` that is a profile.
var NAME = /^[a-z0-9][a-z0-9._-]*$/i;

//WHERE PROFILES SIT INSIDE THE APP'S DIRECTORY. Dot-prefixed so it cannot
//collide with a drawer an app asks for by name -- `dataDir.at('profiles')` is a
//perfectly reasonable thing for somebody to want, and it must not land on top
//of this.
var FOLDER = '.profiles';

//the last one wins, so `--profile=test --no-profile` is a decision and not a
//puzzle
function asked(argv) {
    var list = Array.prototype.slice.call(argv || []);
    var answer = null;

    list.forEach(function (one) {
        var text = String(one);
        if (text == '--no-profile') answer = false;
        else if (text.indexOf('--profile=') === 0) answer = text.slice('--profile='.length);
    });

    return answer;
}

module.exports = function profile(pkg, argv) {
    var flag = asked(argv);
    var said = flag !== null ? flag : (pkg && pkg.app ? pkg.app.profile : undefined);

    if (said === false || said === null || said === undefined || said === '') return null;

    var name = String(said).trim();

    if (!NAME.test(name)) {
        throw new Error('profile: "' + said + '" is not a name. A profile is letters, digits, '
            + 'dot, dash and underscore -- no directories, and no path of any kind. '
            + 'Refusing rather than falling back, because falling back would write '
            + 'this run\'s data into the app\'s own.');
    }

    return name;
};

module.exports.asked = asked;
module.exports.FOLDER = FOLDER;
module.exports.NAME = NAME;
