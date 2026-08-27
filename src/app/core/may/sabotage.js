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
        what: 'a once or a run is written down, so it outlives what it promised',
        file: 'deciding.js',
        check: 'core/may/node',
        find: "function keeps(answer) { return answer === 'always' || answer === 'never'; }",
        replace: 'function keeps(answer) { return !!answer; }'
    },

    //---- and the page, which is where the refusal has to happen -------------
    {
        //REFUSED IN THE PAGE, BEFORE ASKING MAIN. Main would refuse it too, but
        //a round trip to learn that is a round trip a driven run gets to make --
        //and a prompt raised for a driven click is one a second driven click can
        //answer.
        what: 'the page asks main about a press the browser called untrusted',
        file: 'window.js',
        check: 'core/may/window',
        restart: true,
        find: '        if (!trusted) {',
        replace: '        if (false) {'
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
        what: 'a decision is taken without asking who made it',
        file: 'main.js',
        check: 'core/may/main',
        restart: true,
        find: '        var no = deciding.mayDecide(from);',
        replace: '        var no = null; deciding.mayDecide(from);'
    }
];
