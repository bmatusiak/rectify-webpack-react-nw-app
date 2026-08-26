//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//A CACHE FAILS QUIETLY BY CONSTRUCTION. It answers, it is fast, and the answer
//is from before -- so every entry here is a thing that would go on working and
//be wrong, rather than a thing that would break.
//
//NEARLY ALL OF THEM ARE ./drawers.js AND GO TO ./node.test.js, in a tenth of a
//second. That is what the module is for: the rule is about keys, and a rule
//about keys needs no app to be asked. The one that needs the real thing is about
//which half owns the drawers, and it restarts the app -- `main.js` is read off
//disk by the boot and never again.

module.exports = [
    //---- the rule, answered without an app ---------------------------------
    {
        //THE ONE THIS PLUGIN EXISTS FOR. A stamp-keyed drawer holds something
        //derived from a file, and that file may be a sealed credential -- a
        //persisted copy of an unsealed secret is a worse bug than every call
        //the cache saves.
        //IT USED TO POINT AT THE GUARD INSIDE `written`, and survived: the rule
        //was decided in two places and that one was the dead copy -- the call to
        //`save` already refused first. A rule written twice is a rule where one
        //copy can be wrong with nothing noticing, and this is how that looks
        //from the outside. There is one `persisted()` now, and this breaks it.
        what: 'a stamp-keyed drawer is written to disk like a content-keyed one',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: "        function persisted() { return kind === 'byContent' && !!save; }",
        replace: '        function persisted() { return !!save; }'
    },
    {
        what: 'a clock-keyed drawer never expires, so a guess becomes permanent',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: '                    if (!window || (clock() - found.at) < window) {',
        replace: '                    if (true) {'
    },
    {
        //`stale()` IS WHAT MAKES THE THIRD DOOR HONEST. Without it, `whileFresh`
        //is a guess with a timer on it and nothing closes the window when
        //something writes.
        what: 'a write no longer drops the clock-keyed answers',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: "                if (one.kind !== 'whileFresh') return;",
        replace: '                return;'
    },
    {
        what: 'a write also throws away answers that could not have been wrong',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: "                if (one.kind !== 'whileFresh') return;",
        replace: '                if (false) return;'
    },
    {
        //SIZE IS IN THE STAMP because mtime has a resolution, and two writes
        //inside one tick with different lengths is the case it misses.
        what: 'a file is stamped by its time alone, so a same-tick write is missed',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: "        return s.mtimeMs + ':' + s.size;",
        replace: '        return String(s.mtimeMs);'
    },
    {
        what: 'a stamp-keyed drawer keys on the path, so the file may change under it',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: "                return kind === 'byStamp' ? String(key) + '@' + stampOf(key) : String(key);",
        replace: '                return String(key);'
    },
    {
        //A THROWN ERROR IS NOT AN ANSWER. Remembering one makes a bad moment
        //permanent, and the caller has no way to ask again.
        what: 'a computation that threw is remembered as its answer',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: '                    .then(function (value) {\n                        mine.put(at, value);',
        replace: '                    .catch(function (e) { return e; })\n                    .then(function (value) {\n                        mine.put(at, value);'
    },
    {
        what: 'concurrent askers each run the expensive thing themselves',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: '                if (flying.has(at)) {',
        replace: '                if (false) {'
    },
    {
        what: 'a full drawer keeps growing, so the cap is not a cap',
        file: 'drawers.js',
        check: 'core/cached/node',
        find: '                if (answers.size >= keep) { answers.clear(); counts.wiped++; }',
        replace: '                //sabotaged'
    },

    //---- and which half owns them ------------------------------------------
    {
        //MOVING THE DRAWERS INTO THE RELOADING HALF BREAKS NOTHING VISIBLE. The
        //cache is simply cold after every save, which reads as the app being
        //slow while somebody is working on it -- the exact hours it is supposed
        //to help. Only ./server.test.js can say which half is holding them.
        what: 'the node half keeps its own drawers instead of main\'s',
        file: 'server.js',
        check: 'core/cached/server',
        restart: true,
        find: '    if (real) return register(null, { cached: real });',
        replace: '    if (false) return register(null, { cached: real });'
    }
];
