//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE WIRE MAIN REACHES THE PAGE ON, in every build, and four things
//about it are load-bearing -- all four found by the app misbehaving rather than
//by anybody reading it. Its README lists them; this is the same list, broken on
//purpose, with the check that should say so.
//
//IT HAD NO sabotage.js AT ALL until 2026-08-27, which was noticed only because
//something else needed a change here. A plugin the whole window depends on, with
//nothing breaking it deliberately, is a green run that means less than it looks.

module.exports = [
    //---- the protocol, answered without an app -----------------------------
    {
        //TWO CALLS IN FLIGHT ARE THE ORDINARY CASE, not the rare one -- main
        //asks the page several things while it is drawing. Answering by
        //whatever came back last hands one caller the other's answer, and both
        //of them look like they worked.
        what: 'a reply goes to whoever asked last, not to whoever asked',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '            var ack = pending[msg.reply];',
        replace: '            var ack = pending[Object.keys(pending)[0]];'
    },
    {
        //NOTHING IS LEFT WAITING ONCE AN ANSWER IS IN. Without the delete, every
        //call that ever wanted an answer is held for the life of the process --
        //a leak nothing reports, in the one object that sees every message.
        what: 'an answered call is never let go of',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '            delete pending[msg.reply];',
        replace: '            //sabotaged'
    },
    {
        //A HANDLER THAT ANSWERS TWICE IS A BUG ON THE OTHER SIDE, and the reply
        //it sends the second time answers an id nobody is waiting for any more.
        //Swallowing it is kinder than delivering it to whatever has since taken
        //that number.
        what: 'a second answer is sent as though it were the first',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '            if (answered) return;',
        replace: '            if (false) return;',

        //IT SURVIVED THE FIRST TIME THIS LIST WAS RUN, and the reason is worth
        //keeping: the RECEIVING end already drops it. `pending[msg.reply]` was
        //deleted when the first answer arrived, so the second reply reaches a
        //caller nobody is waiting for and vanishes -- which means a test looking
        //at what the CALLER heard cannot see the difference.
        //
        //What it can see is what went ON THE WIRE, and ./node.test.js counts
        //that now. Two protocol messages for one call is a bug whether or not
        //the far end happens to be tidy about it.
    },
    {
        //A LINE THAT IS NOT JSON IS NOT AN EVENT. This channel carries whatever
        //the other end writes, and one malformed line taking the wire down means
        //the page stops answering with no error anybody can see.
        what: 'a line that is not json takes the channel down',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '        try { msg = JSON.parse(line); }\n        catch (e) { return; }//not ours, or not whole',
        replace: '        msg = JSON.parse(line);'
    },
    {
        //`off` WITH ONE HANDLER MUST NOT CLEAR THE REST. The window is shared --
        //../window attaches, and so does this -- and a plugin taking its own
        //listener back used to take everybody's.
        what: 'taking one listener off takes them all off',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '        var list = handlers[event] || [];\n        var i = list.indexOf(fn);\n        if (i >= 0) list.splice(i, 1);',
        replace: '        delete handlers[event];'
    },
    {
        //ONCE FIRES ONCE. It takes itself off BEFORE calling, because a handler
        //that emits from inside itself would otherwise re-enter and fire again.
        what: 'once fires every time',
        file: 'wire.js',
        check: 'core/bridge/node',
        find: '        function wrapped(data, ack) { off(event, wrapped); fn(data, ack); }',
        replace: '        function wrapped(data, ack) { fn(data, ack); }'
    },

    //---- and the window it is attached to ----------------------------------
    {
        //`document-start` FIRES FOR EVERY FRAME, IFRAMES INCLUDED, and the
        //object handed over is that frame's Window either way. The demo's
        //Markdown page renders into a srcdoc iframe, and main repointed at it --
        //so the bridge was attached to a frame with none of the app in it, and
        //everything after that was a page that would not answer.
        what: 'an iframe is taken for the window',
        file: 'main.js',
        check: 'core/bridge/main',
        restart: true,
        //`onStart` AND `onEnd` BOTH ASK IT, so the line matches twice and the
        //tool refuses -- rightly: a sabotage that breaks two things does not say
        //which one the check noticed. document-start is the one that matters,
        //because that is where `__host` is injected.
        find: '        function onStart(frame) {\n            if (!isTop(frame)) return;',
        replace: '        function onStart(frame) {\n            if (false) return;'
    }
];
