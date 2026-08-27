//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE ONLY PLUGIN THAT OPENS A PORT. Everything else in the app talks to
//itself -- ../bridge carries the window's traffic in every build, ../ipc listens
//on a pipe only this account can reach. This one lets something on the network
//be a client, which is why turning it on is a decision a person makes and
//turning it off is a tray item.
//
//SO THE ENTRIES ARE ABOUT TWO THINGS: the port opening when nobody agreed, and
//the gate not being in front of the routes while it is open. Both fail silently
//-- the app serves, and looks exactly as it did.

module.exports = [
    //---- opening it is somebody's decision ---------------------------------
    {
        //THE GUARD SKIPPED ENTIRELY. Anything that can reach the control socket
        //then opens a port to the network, and the first anybody knows is a
        //browser somewhere else showing them the app.
        what: 'the port is opened without anybody being asked',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: "                var said = await imports.may('serve', { from: from });",
        replace: '                var said = { allowed: true };'
    },
    {
        //THE ANSWER ASKED FOR AND THEN IGNORED, which is worse than not asking:
        //somebody watched themselves refuse it and it happened anyway.
        what: 'the person is asked about the port and the answer is ignored',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: '                if (!said.allowed) {',
        replace: '                if (false) {'
    },
    {
        //AND THE OTHER DIRECTION, WHICH IS THE ONE THAT LOOKS SAFE. Asking
        //before CLOSING a port is a guard working against the thing it is for --
        //a refusal that leaves the port open. `may` is not consulted for `off`
        //on purpose, and this is what says so.
        what: 'closing the port needs permission too',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: '            if (data.on) {',
        replace: '            if (true) {'
    },
    {
        //DECLARED, SO IT APPEARS ON THE Guarded PAGE AND IN `node src/cli.js
        //may`. A capability nobody declares is one `may` allows -- see
        //../may/main.js, which is deliberate and is why the declaration is the
        //whole of the opt-in.
        what: 'opening a port stops being declared, so nothing guards it',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: "    imports.may.declare('serve', {",
        replace: "    (function () { }) && imports.may.declare('probe-not-serve', {"
    },

    //---- and the gate in front of the routes -------------------------------
    {
        //WITH THE VIEWER OFF, NOTHING OUTSIDE THIS WINDOW MAY REACH THE APP.
        //Without the gate the routes answer while the app believes it is closed,
        //which is the worst possible version: the tray says off, the port says
        //yes.
        what: 'the routes answer while the viewer is off',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: '        if (!serving) return next();\n        router(req, res, next);',
        replace: '        router(req, res, next);'
    },
    {
        //503 AND NOT 404. "Off" and "not here" are different facts, and somebody
        //reading a log deserves to know which they hit -- a 404 sends them
        //looking for a route that exists.
        what: 'the viewer being off is reported as a missing page',
        file: 'main.js',
        check: 'core/http/main',
        restart: true,
        find: '            if (!serving) return res.status(503).type(\'text\')',
        replace: '            if (false) return res.status(503).type(\'text\')'
    }

    //`BUILD_SERVABLE` IS NOT BROKEN HERE, and that is the finding rather than an
    //omission.
    //
    //There was an entry for it -- drop the constant from `var serving =
    //BUILD_SERVABLE && !!app.serve` and watch a build with no routes in it claim
    //to be serving -- and it cannot fail. In development the constant is TRUE,
    //so `BUILD_SERVABLE && x` and `x` are the same expression, and this runner
    //only ever breaks a development app.
    //
    //Catching it needs a binary built with `"canServe": false` -- `npm run
    //drive -- --package` territory -- which is minutes rather than seconds and
    //is not what a sabotage run is for. Left here as a sentence instead of a
    //check that always passes.
];
