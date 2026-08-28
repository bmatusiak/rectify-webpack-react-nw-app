//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//EVERY ONE OF THESE IS A WAY OF SAYING YES WHEN NOBODY DID. That is the only
//failure this plugin has -- a permission system that refuses too much is
//annoying, and one that allows too much is the thing it was built to prevent.
//
//THE RULE GOES TO ./node.test.js in a tenth of a second. The registry and the
//page need the app, and main.js is read off disk by the boot -- see
//../../../../tools/sabotage.js, which is why those restart it.

module.exports = [
    //---- the stance, which is the other half and the same failure ----------
    //
    //A DENY LIST SAYS YES WHEN NOBODY DID BY FORGETTING TO NAME SOMETHING. The
    //stance says yes by defaulting the wrong way, and it is the more dangerous
    //of the two because the failure is silent AND global -- one wrong boolean
    //and a shipped binary is driveable by anything that can open a socket.
    //
    //ALL OF THESE GO TO ./node.test.js, and that is the point. Hiding, refusing
    //and listing only differ in a CLOSED build, and every machine this is worked
    //on runs an open one -- so an entry that needed a package would be an entry
    //nobody runs, which ../../ui/theme/sabotage.js already argues is worse than
    //no entry at all.
    {
        //THE DEFAULT, AND THE DIRECTION THAT COSTS SOMETHING. Absent from the
        //manifest has to mean CLOSED when packaged: getting it backwards ships
        //a binary anything can drive and nothing says a word.
        what: 'a manifest that says nothing ships an open package',
        file: '../../../stance.js',
        check: 'core/may/node',
        find: '    return !isProduction;',
        replace: '    return true;'
    },
    {
        //THE OVERRIDE THAT EXISTS SO THE CLOSED BRANCH CAN BE RUN AT ALL.
        //Ignore it and `npm run drive -- --closed` silently drives an OPEN app
        //and passes -- a whole suite reporting green about the stance it was
        //not testing, which is worse than the suite not existing.
        what: 'the environment override is ignored, so a closed run drives an open app',
        file: '../../../stance.js',
        check: 'core/may/node',
        find: '    if (said) {',
        replace: '    if (false) {'
    },
    {
        //EVERY ENVIRONMENT VARIABLE IS A STRING, so `APP_OPEN=false` is truthy
        //and a loose reading OPENS a build somebody plainly meant to close.
        //Refused, naming the variable -- the same rule as the manifest key.
        what: 'an environment value nobody understands is read loosely',
        file: '../../../stance.js',
        check: 'core/may/node',
        find: "        if (said === '1' || said === 'true') return true;",
        replace: '        return !!said;'
    },
    {
        //SAYING NOTHING IS NOT SAYING NO. Read `''` or a missing `env` as a
        //value and every machine that has never heard of this closes every
        //build it makes -- the default nobody asked for, arriving silently.
        what: 'an empty or absent environment is read as an answer',
        file: '../../../stance.js',
        check: 'core/may/node',
        find: '    var said = env && env.APP_OPEN;',
        replace: "    var said = (env && env.APP_OPEN) || '0';"
    },
    {
        //A STRING IS TRUTHY, which is how `"open": "false"` would ship a build
        //the manifest plainly meant to close. Refused rather than guessed at.
        what: 'a manifest that says something odd is guessed at rather than refused',
        file: '../../../stance.js',
        check: 'core/may/node',
        find: "        if (typeof app.open !== 'boolean') {",
        replace: '        if (false) {'
    },
    {
        //THE GATE ITSELF. Without this a closed build reaches everything, which
        //is the whole feature undone by one line -- and looks like working code.
        what: 'a closed build reaches whatever it is asked for',
        file: 'stance.js',
        check: 'core/may/node',
        find: '        if (!closed) return null;',
        replace: '        return null;'
    },
    {
        //FAIL SHUT. A config that cannot be read is not a config that lists
        //nothing -- but both refuse, so the only way to tell them apart is the
        //sentence, and a caller staring at the wrong one looks in the wrong file.
        what: 'a config that cannot be read is treated as one that listed nothing',
        file: 'stance.js',
        check: 'core/may/node',
        find: '        if (lists.unreadable) {',
        replace: '        if (false) {'
    },
    {
        //A TYPO IS A LIST THAT DOES NOTHING. `command:` for `commands:` leaves
        //every command shut while the config plainly says otherwise, which reads
        //as a broken app rather than as a misspelling.
        what: 'a misspelled kind is accepted in silence',
        file: 'stance.js',
        check: 'core/may/node',
        find: '    if (strange.length) {',
        replace: '    if (false) {'
    },
    {
        //THE LISTS MUST NOT BLEED. An MCP tool called `screenshot` being open
        //does not make a COMMAND of that name reachable -- they are different
        //surfaces, and one list standing in for another opens a name somewhere
        //nobody meant.
        what: 'one kind of name opens another',
        file: 'stance.js',
        check: 'core/may/node',
        find: '        if (lists[kind].indexOf(name) >= 0) return null;',
        replace: '        if (JSON.stringify(lists).indexOf(name) >= 0) return null;'
    },
    {
        //A ROW THAT IS NOT A NAME. Numbers and empty strings in the list are a
        //config somebody got wrong, and letting them through means `indexOf`
        //quietly matching nothing while the screen says the name is open.
        what: 'a list with something in it that is not a name is used anyway',
        file: 'stance.js',
        check: 'core/may/node',
        find: "        var bad = said.filter(function (one) { return typeof one !== 'string' || !one; });",
        replace: '        var bad = [];'
    },
    {
        //WHAT IS LISTED BUT NOT THERE. The only drift a list of names invites,
        //and the Reachable page draws it -- so losing it means the config goes
        //on promising something that no longer exists, silently.
        what: 'a listed name that nothing registers is never reported',
        file: 'stance.js',
        check: 'core/may/node',
        find: '        return lists[kind].filter(function (name) { return present.indexOf(name) < 0; });',
        replace: '        return [];'
    },

    //---- the rule, answered without an app ---------------------------------
    {
        //THE ONE THE WHOLE DESIGN RESTS ON.
        what: 'the control socket is allowed to decide',
        file: 'deciding.js',
        check: 'core/may/node',
        find: '    if (from.overTheWire) {',
        replace: '    if (false) {'
    },
    {
        what: 'a driven click passes as a person',
        file: 'deciding.js',
        check: 'core/may/node',
        find: '        if (!from.trusted) {',
        replace: '        if (false) {'
    },
    {
        //WRITTEN THE OTHER WAY ROUND -- refuse what you can name, allow the
        //rest -- this let `{}` through: a caller that said nothing about where
        //it came from was treated as a person at the window. Its own test found
        //that before anything else did.
        what: 'a caller that says nothing about itself is trusted',
        file: 'deciding.js',
        check: 'core/may/node',
        find: "    return 'a decision comes from a person at the window, and this did not say it was one';",
        replace: '    return null;'
    },
    {
        //THE WRONG ANSWER IN ONE DIRECTION COSTS SOMEBODY A PRESS. The wrong
        //answer in this one is something nobody agreed to, kept for ever.
        what: 'an unreadable file fails open instead of shut',
        file: 'deciding.js',
        check: 'core/may/node',
        find: '    if (world.unreadable) {',
        replace: '    if (false) {'
    },
    {
        what: 'a never is treated as a question, so it gets asked again',
        file: 'deciding.js',
        check: 'core/may/node',
        find: "    if (world.kept === 'never') return { allowed: false, why: name + ' is never allowed' };",
        replace: '    //sabotaged'
    },
    {
        //A ROW NOBODY UNDERSTANDS POISONS THE FILE rather than being skipped.
        //Skipping it would quietly drop a `never` somebody set.
        what: 'an answer nobody understands is skipped rather than distrusted',
        file: 'deciding.js',
        check: 'core/may/node',
        find: "            bad = bad || ('\"' + name + '\" has an answer this does not understand');",
        replace: '            //sabotaged'
    },
    {
        //THE RULE THAT SAYS A PERSON JUST DID IT, WHICH `may()` USES TO GO
        //AHEAD WITHOUT ASKING ANYBODY.
        //
        //TAKEN THE WRONG WAY THIS IS THE WORST BREAK IN THE PLUGIN: every
        //undecided capability is handed to anything that asks, and no dialog is
        //ever raised, so there is nothing on screen to notice it by. It is a
        //permission system that says yes and looks exactly like one that was
        //answered.
        //
        //IT WAS WRITTEN OUT AT THE CALL SITE IN main.js AS `from.window &&
        //from.trusted` -- a SECOND definition of a person, a few lines from the
        //first -- and a full sabotage run of this plugin came back 13 of 13
        //caught while nothing whatever was watching it. Sharing `mayDecide` is
        //what puts it under the three entries above as well as this one.
        what: 'anything is taken for a person who just did it',
        file: 'deciding.js',
        check: 'core/may/node',
        find: 'function personDid(from) { return mayDecide(from) === null; }',
        replace: 'function personDid(from) { return true; }'
    },
    {
        what: 'a once or a run is written down, so it outlives what it promised',
        file: 'deciding.js',
        check: 'core/may/node',
        find: "function keeps(answer) { return answer === 'always' || answer === 'never'; }",
        replace: 'function keeps(answer) { return !!answer; }'
    },

    //---- and the page, which is where the refusal has to happen -------------
    {
        //THE ASYMMETRY THAT LETS THE DIALOG EXIST AT ALL.
        //
        //Anything may say no -- refusing can only make the app do less, and a
        //dialog only a person can dismiss would leave every driven run staring
        //at a modal. But ALLOWING needs a person, or one driven press raises the
        //question and a second gets through it, and the prompt becomes the way
        //around the prompt.
        what: 'anything may answer the question, not just take it away',
        file: 'window.js',
        check: 'core/may/window',
        restart: true,
        find: '                    if (!safe && !personPressed(event)) return;',
        replace: '                    if (false) return;'
    },
    {
        //THE CHECK ITSELF, WHICH IS ONE FUNCTION FOR A REASON.
        //
        //It was written twice -- once for the press that raises the question and
        //once for the press that answers it -- and the second copy survived this
        //list, because there is no way to drive a prompt into existence to test
        //it: getting one to appear requires the very press it refuses. As one
        //function, the test that covers the button covers the dialog, which is
        //the only way the dialog is coverable at all.
        what: 'the word the browser gives a real press stops being asked for',
        file: 'window.js',
        check: 'core/may/window',
        restart: true,
        find: '    function personPressed(event) { return !!(event && event.isTrusted); }',
        replace: '    function personPressed(event) { return !!event; }'
    },

    //---- and the registry --------------------------------------------------
    {
        what: 'nothing is guarded, whatever the code declared',
        file: 'main.js',
        check: 'core/may/main',
        restart: true,
        find: '    function asks(name) { return !!declared[name]; }',
        replace: '    function asks(name) { return false; }'
    },
    {
        //A SINGLE LINE, BECAUSE `forget` ASKS THE SAME QUESTION and the tool
        //refuses a pattern that matches twice -- which is the right refusal: a
        //sabotage that breaks two things does not say which one the check
        //noticed. So this stamps the caller as a person on the way in, which is
        //the same fault seen from one step earlier.
        what: 'every caller is taken for a person at the window',
        file: 'main.js',
        check: 'core/may/main',
        restart: true,
        find: '    function decide(name, answer, from) {',
        replace: '    function decide(name, answer, from) { from = { window: true, trusted: true };'
    },
    {
        //FORGETTING IS THE DIRECTION THAT LOOKS HARMLESS, which is exactly why
        //it is worth breaking on purpose. It can only ever make the app do less
        //-- so letting anything do it seems like a kindness -- but a driven run
        //that could forget things could clear a `never`, and the next caller
        //would be asked about something a person had already refused. A refusal
        //quietly turning back into a question is the failure with no symptom.
        what: 'anything may take a decision back, including a never',
        file: 'main.js',
        check: 'core/may/main',
        restart: true,
        find: '    function forget(name, from) {',
        replace: '    function forget(name, from) { from = { window: true, trusted: true };'
    },
    {
        //AND THE PAGE'S HALF OF THE SAME SENTENCE. Main is only as good as what
        //the window tells it about the press, so a page that always said "a
        //person did this" would undo the rule from the other end.
        what: 'the page says a person pressed it however it was pressed',
        file: 'window.js',
        check: 'core/may/window',
        restart: true,
        find: "            io.emit('may:forget', { name: name, trusted: personPressed(event) }, function (out) {",
        replace: "            io.emit('may:forget', { name: name, trusted: true }, function (out) {"
    }
];
