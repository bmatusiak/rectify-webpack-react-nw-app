//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//ALL OF THESE ARE ABOUT `health`, and `health` exists because the app's other
//ways of answering "are you up" all go through a half that is gone in exactly
//the cases worth asking about. So the failure being defended against is not "it
//answers wrongly" -- it is "it stops being the half that can answer at all".
//
//THEY RESTART THE APP, because main.js is read off disk by the boot and never
//again -- see ../../../../tools/sabotage.js.

module.exports = [
    {
        //THE FIELD tools/drive.js CAME HERE FOR. Without it drive falls back to
        //nothing: it cannot refuse to drive a source tree it was told was a
        //package, which is a pass about the wrong app.
        what: 'health stops saying whether the build is packaged',
        file: 'main.js',
        check: 'core/lifecycle/main',
        restart: true,
        find: '            packaged: !!app.isPackaged,',
        replace: '            //sabotaged'
    },
    {
        //THE WHOLE POINT: main can see the window when nothing inside it is
        //alive. Answering from something that dies with the page would make
        //this command exactly as useless as the two it replaced.
        what: 'main stops being able to see its own window',
        file: 'main.js',
        check: 'core/lifecycle/main',
        restart: true,
        find: '                attached: !!imports.bridge.attached,',
        replace: '                attached: false,'
    },
    {
        //`trouble` IS THE TEXT, NOT A BOOLEAN. "Something failed" sends
        //somebody looking; the first line of the message usually ends it.
        what: 'trouble becomes a yes-or-no, so nothing says what failed',
        file: 'main.js',
        check: 'core/lifecycle/main',
        restart: true,
        find: '                trouble: trouble || null',
        replace: '                trouble: !!trouble'
    },
    {
        what: 'the command is never registered at all',
        file: 'main.js',
        check: 'core/lifecycle/main',
        restart: true,
        find: "    var health = ipc.handle('health', function () {",
        replace: "    var health = { remove: function () { } };\n    if (false) ipc.handle('health', function () {"
    }
];
