//WHAT A CLIENT IS TOLD THIS SERVER HAS.
//
//A MODULE BECAUSE THE INTERESTING BRANCH IS THE ONE NO DEVELOPER RUNS. Hiding
//only happens in a closed build, and every machine this is written on runs an
//open one -- so as a closure inside ./server.js the whole of it could be broken
//with every check still green. That is not a hypothetical: ../../app/core/bridge
///isTop.js, ../../app/core/ipc/token.js, ../../app/core/dataDir/places.js and
//../../app/ui/theme/isDark.js were all moved out for exactly this, each after
//its own sabotage survived.
//
//`isHidden` IS A PREDICATE HANDED IN, not ../../app/core/may reached for. That
//is the whole trick: ./node.test.js hands it `() => true` and `() => false` and
//sees both answers in a millisecond, with no app, no package and no manifest
//edit.
//
//LISTING AND HIDING ARE ONE FILE ON PURPOSE. `tools/list` leaving something out
//while `tools/call` still answers it is not hiding -- it is a door that is
//invisible from one side, which a model finds by guessing a name. Both sides of
//./server.js ask these.

//WHAT IS LEFT AFTER THE HIDING.
//
//IT TAKES THE REGISTRIES EITHER WAY ROUND -- tools, resources and prompts are
//maps keyed by name; resource templates are an array carrying their own -- and
//writing it twice is how the two come to disagree about what a build admits to
//having.
module.exports.shown = function shown(map, isHidden) {
    var names = Array.isArray(map)
        ? map.map(function (one) { return one && one.name; })
        : Object.keys(map || {});

    return names.filter(function (name) { return !isHidden || !isHidden(name); });
};

//AND THE LIST ITSELF, WHICH IS THE SAME FILTER PLUS A SCRUB.
//
//`drop` TAKES OUR OWN FIELDS OFF. `run`, `read` and `needs` are this app's and
//not the protocol's -- a client that validates what it is sent would be right to
//reject them, and `needs` in particular is a map of what is guarded, handed to
//the one caller it is guarded against.
//
//AND AN undefined FIELD IS OMITTED RATHER THAN SENT AS NULL, because a client
//reading `title: null` has to decide what that means.
module.exports.listed = function listed(map, drop, isHidden) {
    return module.exports.shown(map, isHidden).sort().map(function (key) {
        var copy = Object.assign({}, map[key]);
        (drop || []).forEach(function (field) { delete copy[field]; });

        Object.keys(copy).forEach(function (field) {
            if (copy[field] === undefined) delete copy[field];
        });

        return copy;
    });
};
