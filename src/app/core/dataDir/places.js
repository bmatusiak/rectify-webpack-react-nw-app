var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');

//WHERE THINGS GO, ANSWERED WITHOUT AN APP.
//
//./main.js worked all of this out inline, and none of it could be checked: the
//app under test runs with NO profile, so the branch that puts one somewhere
//never executed and the folder name was only ever RE-DERIVED by the test rather
//than observed. Both of its sabotages survived -- main.js was broken on purpose
//and every check passed, because none of them could see the code.
//
//The test even required `../../../profile` itself to get the folder name, which
//proves the two agree about a constant and nothing about whether main.js uses
//it. Same cut as ../bridge/isTop.js, ../ipc/token.js and ../may/deciding.js.

//WHERE PROFILES SIT INSIDE THE APP'S DIRECTORY, named once in
//../../../profile.js so the boot that validates the name and the code that
//builds the path cannot come to differ about the layout.
var PROFILES = require('../../../profile').FOLDER;

//THE APP'S OWN DIRECTORY, BY PLATFORM. `%LOCALAPPDATA%\<name>` on windows and
//`~/.config/<name>` elsewhere -- the places each of them expects to find
//application data, rather than a dot-directory in the home folder on both.
//
//`platform`, `env` AND `home` ARE ARGUMENTS so both branches can be asked for on
//one machine. Reading them from the outside would make half of this untestable
//wherever it happened to be running, which is how it got here.
module.exports.root = function root(name, platform, env, home) {
    platform = platform || process.platform;
    env = env || process.env;
    home = home || os.homedir();

    return platform === 'win32'
        ? path.join(env.LOCALAPPDATA || home, name)
        : path.join(home, '.config', name);
};

//AND WHICH WORLD INSIDE IT.
//
//A PROFILE MOVES ALL OF IT, which is the whole feature: state, secrets and
//whatever anything else keeps all sit under this, so moving this moves them
//without one plugin knowing the feature exists.
//
//THE APP'S OWN DIRECTORY DOES NOT MOVE. With no profile this is exactly where it
//always was, so adding profiles relocated nothing already on disk -- the
//difference between a feature and a migration.
module.exports.within = function within(root, profile) {
    return profile ? path.join(root, PROFILES, profile) : root;
};

//WHAT WORLDS THERE ARE. A profile is created by being asked for, so nothing else
//can list them -- and a switch nobody can enumerate is a switch with no way back
//except remembering what you typed.
//
//NONE HAVING EVER BEEN USED IS NOT AN ERROR, and that is the whole of the catch:
//the folder does not exist until somebody has asked for a profile, and a throw
//here would take out whatever screen was listing them.
module.exports.namesIn = function namesIn(root) {
    try {
        return fs.readdirSync(path.join(root, PROFILES), { withFileTypes: true })
            .filter(function (e) { return e.isDirectory(); })
            .map(function (e) { return e.name; })
            .sort();
    } catch (e) {
        return [];
    }
};

module.exports.PROFILES = PROFILES;
