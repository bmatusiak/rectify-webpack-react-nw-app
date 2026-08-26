var os = require('node:os');
var path = require('node:path');
var fs = require('node:fs');

//---------------------------------------------------------------------------
//WHERE THIS APP'S DATA LIVES ON DISK, WORKED OUT ONCE.
//
//    package.json  "name": "rectify-webpack-react-nw-app"
//    windows       %LOCALAPPDATA%\<name>\
//    elsewhere     ~/.config/<name>/
//
//IT IS DERIVED FROM `name` IN package.json, AND THAT IS NOT OBVIOUS. nw.js
//picks its own profile directory from the package name, and everything else
//that wants somewhere to put something has followed it there.
//
//WHICH MEANS RENAMING THE APP MOVES ITS DATA, SILENTLY. Change that one string
//and the next launch looks in a directory that does not exist yet, finds
//nothing, and behaves exactly as though this were a first run. Nothing
//announces it. It reads as "the app forgot my settings", which sends somebody
//searching in the wrong place.
//
//Three things in this scaffold already move when that name does, and none of
//them say so:
//
//  the control socket   ../ipc/main.js builds the pipe name from it, so
//                       `node src/cli.js` stops finding the app
//  the ipc token        the same, in the temp directory -- a renamed app cannot
//                       authenticate against a running old one
//  the nw profile       localStorage goes with it, so ../webStorage's
//                       `preferences` come back empty and every remembered
//                       choice is gone
//
//THE POINT OF PUTTING IT HERE is that those are three derivations of ONE fact.
//Two is already how a rename becomes a mystery in one place and not the other;
//a fourth plugin working it out again is the bug waiting to happen.
//
//WHAT BELONGS IN IT: things the node side owns and the page may not reach.
//NOT where somebody was looking or what they had selected -- that is the
//browser's, and ../webStorage is where it goes.
//---------------------------------------------------------------------------

//WHERE PROFILES SIT INSIDE THE APP'S DIRECTORY, named once in
//../../../profile.js so the boot that validates the name and the plugin that
//builds the path cannot come to differ about the layout.
var PROFILES = require('../../../profile').FOLDER;

plugin.consumes = ['app'];
plugin.provides = ['dataDir'];
async function plugin(imports, register) {
    var app = imports.app;

    //THE HOST IS MERGED ONTO `app` IN THIS CONTEXT, which is why this reads
    //`app.appPackage` and the server half reads `app.host.dataDir`. Same fact,
    //two shapes, because main IS the host and the node half is handed one.
    var name = (app.appPackage && app.appPackage.name) || 'rectify-app';

    var root = process.platform === 'win32'
        ? path.join(process.env.LOCALAPPDATA || os.homedir(), name)
        : path.join(os.homedir(), '.config', name);

    //A PROFILE MOVES ALL OF IT, WHICH IS THE WHOLE FEATURE.
    //
    //`--profile=test` gives a run its own world without one plugin knowing the
    //feature exists: state, secrets and whatever anything else keeps all root
    //under this, so moving this moves them. See ../../../profile.js, which
    //decides it, refuses a name that is not one, and says why it refuses rather
    //than falling back.
    //
    //THE APP'S OWN DIRECTORY DOES NOT MOVE. With no profile this is exactly
    //where it always was, so adding profiles relocated nothing that was already
    //on disk -- which is the difference between a feature and a migration.
    //
    //NOT THE SAME THING AS A NAMESPACE, and ../state carries the other half:
    //this changes the ROOT, decided once, because a process cannot be halfway
    //between two data directories. A namespace changes a DRAWER, at runtime,
    //and leaves the things that must survive the switch where they are.
    var profile = app.profile || null;
    var dir = profile ? path.join(root, PROFILES, profile) : root;

    await register(null, {
        dataDir: {
            //the directory, and the name it came from -- so anything reporting a
            //path can also report WHY it is that path, which is the whole
            //difficulty above in one field
            path: dir,
            from: name,

            //null when there is none, rather than a word meaning none. A screen
            //saying `profile: default` invites somebody to look for a directory
            //called default, and there is not one.
            profile: profile,

            //THE APP'S DIRECTORY WHATEVER PROFILE IS ON, which is the only way
            //to reach across from inside one. Everything that keeps something
            //should use `path`; this is for the thing that has to know what
            //ELSE exists, and `profiles()` below is the reason it is here at all.
            root: root,

            //WHAT WORLDS THERE ARE. A profile is created by being asked for, so
            //nothing else can list them -- and a switch nobody can enumerate is
            //a switch with no way back except remembering what you typed.
            profiles: function () {
                try {
                    return fs.readdirSync(path.join(root, PROFILES), { withFileTypes: true })
                        .filter(function (e) { return e.isDirectory(); })
                        .map(function (e) { return e.name; })
                        .sort();
                } catch (e) {
                    return [];//none have ever been used, which is not an error
                }
            },

            at: function (/* ...parts */) {
                return path.join.apply(path, [dir].concat([].slice.call(arguments)));
            },

            //MAKING IT IS PART OF THE JOB, not the caller's. Without this every
            //plugin that writes a file carries the same `mkdirSync(..., {
            //recursive: true })` -- and the one that forgets does not fail at
            //boot, it fails the first time somebody saves something.
            //
            //It is separate from `at` because reading a path should not create a
            //directory: `dataDir.at('x')` in a log line would otherwise leave a
            //folder behind as a side effect of describing one.
            ensure: function (/* ...parts */) {
                var where = path.join.apply(path, [dir].concat([].slice.call(arguments)));
                fs.mkdirSync(where, { recursive: true });
                return where;
            }
        }
    });
}
module.exports = plugin;
