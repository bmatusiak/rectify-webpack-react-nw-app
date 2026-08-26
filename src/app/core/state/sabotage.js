//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//EVERY ONE OF THESE IS ABOUT THE SECOND DRAWER, because that is where the
//failures are silent. Breaking the app's own drawer shows up immediately -- a
//document does not come back, and somebody notices within a minute. Breaking
//the namespaced one shows up as the WRONG document coming back, which looks
//exactly like the right one until you are in the other namespace.
//
//THE NAME RULES GO TO ./node.test.js, in a tenth of a second. The drawer itself
//needs the real dataDir, so those go to `core/state/main` and pay for a trip
//through the running app.

module.exports = [
    //---- the rules, answered without an app --------------------------------
    {
        what: 'a namespace with a path in it is sanitised instead of refused',
        file: 'names.js',
        check: 'core/state/node',
        find: "        throw new Error('a namespace is named in letters, digits, dot, dash and underscore -- \"'",
        replace: "        return clean.replace(/[^a-z0-9._-]+/gi, '') || 'x'; throw new Error('unreachable -- \"'"
    },
    {
        what: 'the slug drops its hash, so two folders with one name share a drawer',
        file: 'names.js',
        check: 'core/state/node',
        find: "    return readable + '-' + sum.toString(36);",
        replace: '    return readable;'
    },
    {
        what: 'a slug may begin with a dot, which is a hidden directory and not a name',
        file: 'names.js',
        check: 'core/state/node',
        find: ".replace(/^[^a-z0-9]+/i, '')",
        replace: ".replace(/^-+/g, '')"
    },

    //---- and the drawer, inside the app ------------------------------------
    //
    //`restart: true` BECAUSE main.js IS READ OFF DISK BY THE BOOT AND NEVER
    //AGAIN. Waiting on a file's mtime is what the bundled halves need and is
    //meaningless here: the running app is still holding the copy from before
    //the edit, so all four of these once "survived" against an app that had
    //never seen them. A restart is the only event that puts a main-side change
    //into a running app, and it costs about four seconds each.
    {
        what: 'nowhere falls through to the drawer the app owns',
        file: 'main.js',
        check: 'core/state/main',
        restart: true,
        find: '            var now = here();\n            if (!now) nowhere(name);',
        replace: '            var now = here() || null;\n            if (!now) return doc(name);'
    },
    {
        what: 'a follower that throws is treated as no namespace being open at all',
        file: 'main.js',
        check: 'core/state/main',
        restart: true,
        //THE FIRST VERSION OF THIS ENTRY CHANGED NOTHING. It set `said = null`
        //in the catch, which is what the code already does -- so it was applied,
        //the check passed, and it was reported as a sabotage nothing watches.
        //A sabotage that does not change behaviour is indistinguishable from a
        //test that is not looking, and only one of those is worth fixing.
        find: "            return null;\n        }\n\n        return said ? String(said) : null;",
        replace: "            return 'nowhere';\n        }\n\n        return said ? String(said) : null;"
    },
    {
        what: 'the namespace is read once and closed over, so a switch is not followed',
        file: 'main.js',
        check: 'core/state/main',
        restart: true,
        find: '                function () { return hereAt() || nowhere(name); },',
        replace: '                (function (fixed) { return function () { return fixed; }; }(hereAt())),'
    },
    {
        what: 'a second follower joins the first instead of replacing it',
        file: 'main.js',
        check: 'core/state/main',
        restart: true,
        find: '                asking = fn;',
        replace: '                asking = asking || fn;'
    }
];
