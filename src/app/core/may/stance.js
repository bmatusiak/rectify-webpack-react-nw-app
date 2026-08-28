//---------------------------------------------------------------------------
//WHAT A CLOSED BUILD REACHES.
//
//./deciding.js is the deny half -- a named capability, and a person answering
//about it. This is the ALLOW half: in a closed build nothing is reachable except
//what somebody listed before shipping, and there is no dialog, because a
//default-deny that prompts is a default-deny that gets answered `always` to
//everything inside a week.
//
//WHETHER THE BUILD IS CLOSED AT ALL IS ../../../stance.js's, not this file's.
//../../../../webpack.config.js and ../../../main.js both need that answer before
//any plugin exists, and ../../../../CLAUDE.md warns that a build config reaching
//into a plugin by path is a plugin that cannot be moved. Same cut as
//../dataDir/places.js taking its folder name from ../../../profile.js.
//
//---- why this is a module --------------------------------------------------
//
//TWO STANCES MEANS TWO BEHAVIOURS AND THE ONE NOBODY RUNS ROTS. That is not a
//worry, it is this codebase's most-repeated finding: ../bridge/isTop.js,
//../ipc/token.js, ../dataDir/places.js, ../../ui/theme/isDark.js and
//./deciding.js#personDid were all rules that survived their own sabotage because
//nothing on one machine could reach the branch.
//
//So the stance is handed in rather than read off the world, and ./node.test.js
//asks BOTH BRANCHES in a millisecond with no build, no window and no package.
//Reading BUILD_OPEN in here would make the closed half unaskable on any machine
//running a development build -- which is every machine this is written on.
//---------------------------------------------------------------------------

//WHAT CAN BE LISTED. The keys are the config's, so there is one vocabulary
//rather than a set of names here and a map to the names over there.
//
//PROMPTS ARE THEIR OWN KIND rather than being folded in with resources. They
//are a different surface -- a template a model asks for by name, which can put
//the app's own data into a conversation -- and one list standing in for another
//is how a name becomes reachable somewhere nobody meant.
var KINDS = ['commands', 'tools', 'resources', 'prompts'];

//---------------------------------------------------------------------------
//READING THE LIST.
//
//`{ commands, tools, resources, unreadable }`, and it fails the same way
//./deciding.js#read does: a list that makes no sense poisons the whole thing
//rather than being skipped, because skipping one quietly hands back a build that
//looks configured and is not.
//
//UNREADABLE IS NOT EMPTY, and the difference is only a sentence -- both refuse
//everything. But "nobody listed anything" is an ordinary state and "your config
//is wrong" is not, and a person staring at a refusal needs to know which.
function read(config) {
    var out = { unreadable: null };
    KINDS.forEach(function (kind) { out[kind] = []; });

    if (config === null || config === undefined) return out;

    if (typeof config !== 'object' || Array.isArray(config)) {
        out.unreadable = 'the open list is not a set of lists';
        return out;
    }

    //A KEY NOBODY UNDERSTANDS IS A TYPO, AND A TYPO HERE IS A LIST THAT DOES
    //NOTHING. `command: [...]` for `commands` would leave every command shut
    //while the config plainly says otherwise -- which reads as a broken app
    //rather than as a misspelling, and is looked for in the wrong file.
    var strange = Object.keys(config).filter(function (key) { return KINDS.indexOf(key) < 0; });

    if (strange.length) {
        out.unreadable = 'the open list has ' + strange.join(', ')
            + ' in it, and the kinds are ' + KINDS.join(', ');
        return out;
    }

    for (var i = 0; i < KINDS.length; i++) {
        var kind = KINDS[i];
        var said = config[kind];

        if (said === undefined) continue;

        if (!Array.isArray(said)) {
            out.unreadable = 'the open ' + kind + ' are not a list';
            return out;
        }

        var bad = said.filter(function (one) { return typeof one !== 'string' || !one; });

        if (bad.length) {
            out.unreadable = 'the open ' + kind + ' has something in it that is not a name';
            return out;
        }

        out[kind] = said.slice();
    }

    return out;
}

//---------------------------------------------------------------------------
//AND WHAT THAT BUILD REACHES.
function of(open, config) {
    var lists = read(config);
    var closed = !open;

    //THE ANSWER IS THE SAME SHAPE AS ./deciding.js's: null for yes, a sentence
    //for no. A caller that has to read a boolean AND a reason writes the same
    //two lines at every call site, and one of them eventually gets the sense
    //backwards.
    function reaches(kind, name) {
        if (!closed) return null;

        if (KINDS.indexOf(kind) < 0) {
            return 'nothing here knows what a "' + kind + '" is, so it is not reachable';
        }

        //FAIL SHUT, AND SAY WHICH KIND OF SHUT. Every list is empty when the
        //config could not be read, so this would refuse anyway -- but it would
        //refuse saying the name is missing from a list somebody can see is right
        //there, which sends them looking in the wrong place.
        if (lists.unreadable) {
            return 'this build is closed and its open list could not be read ('
                + lists.unreadable + '), so nothing is reachable';
        }

        if (lists[kind].indexOf(name) >= 0) return null;

        return 'this build is closed. "' + name + '" is not in config.may.open.' + kind
            + ', and a closed build cannot be opened while it is running.';
    }

    //WHAT IS LISTED BUT NOT THERE, which is the drift a list of names invites: a
    //command gets renamed and the entry stays, saying something is reachable
    //that does not exist. The other direction needs no help -- a new command is
    //closed by default, which is the safe way round.
    function stale(kind, present) {
        if (!closed || lists.unreadable) return [];

        return lists[kind].filter(function (name) { return present.indexOf(name) < 0; });
    }

    return {
        open: !closed,
        closed: closed,
        lists: lists,
        unreadable: lists.unreadable,
        reaches: reaches,
        stale: stale
    };
}

module.exports.KINDS = KINDS;

//RE-EXPORTED RATHER THAN RESTATED, so a plugin asking whether the build is open
//and the build that decided it cannot come to differ. Both of them: `decided`
//is whether anything may drive this build at all, and `driveable` is whether a
//closed one lists the four commands a driver arrives on.
module.exports.decided = require('../../../stance').decided;
module.exports.driveable = require('../../../stance').driveable;

module.exports.read = read;
module.exports.of = of;
