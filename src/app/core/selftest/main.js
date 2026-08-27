var suites = require('./suites');

//RUNNING THE TESTS INSIDE THE APP.
//
//None of the four contexts is easy to boot from a test file, and two are
//impossible: `main` needs nw around it, `window` needs a document. So do not
//boot any of them. Ask the running app -- which is already in all four -- to
//run its own suites and say what happened.
//
//WHY THE HARNESS IS A SERVICE. The module exports one shared instance, and in
//development `main` and `server` are the same node process: they share a module
//registry, so both contexts collected into one set of suites and each reported
//the other's results as its own. `harness.create()` gives an independent one,
//and handing it out as a service is what makes a test plugin say which context
//it belongs to -- by consuming the one in its own graph.
//
//the test plugins are loaded ALWAYS, in development, by all four boots. That is
//what lets a running app be asked for any one of them without being started
//again, and webpack carries an edited test straight into it. Which one runs is
//decided when the run is asked for -- see ./suites.js and src/target.js.
//A packaged build has no path that loads them at all.

plugin.consumes = ['app', 'ipc', 'io'];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    var { app, ipc, io } = imports;
    var mine = suites();

    //THE NW WINDOW, AND NOT MERELY THE FIRST THING CONNECTED.
    //
    //This took whatever socket came first, which was right while the window was
    //the only client there could be. It stopped being right the moment a browser
    //could join: ../io/server.test.js switches the browser viewer on and opens a
    //real socket.io client, and `selftest:run` went to THAT -- a throwaway client
    //with no test runner in it, which never answered. The window suite then sat
    //there for its full 120 seconds and reported itself stuck, which is a long
    //quiet way to be told the message went to the wrong place.
    //
    //The window is on ../bridge in every build and the bridge calls its one
    //socket `window`, so there is a name to ask for. The fallback is kept for
    //the case where there is no bridge at all -- nothing does that today, and a
    //nastier failure than "no window is connected" is not worth the saving.
    function page() {
        var all = io.sockets.sockets;

        var window_ = all.get && all.get('window');
        if (window_) return window_;

        var found = null;
        all.forEach(function (socket) { if (!found) found = socket; });
        return found;
    }

    //`missing` is a context that had nothing to run, which is a fact about how
    //the app was started. `stuck` is a context that had something to run and
    //did not finish, which is a failure -- telling them apart matters, because
    //one is reported as a skip and reporting the other that way would let a
    //window test that hangs pass in silence.
    function absent(context, why, stuck) {
        return { context: context, suites: [], passed: 0, failed: stuck ? 1 : 0, missing: why, stuck: !!stuck };
    }

    function fromWindow(timeout, only) {
        var socket = page();

        //NO WINDOW IS A FAILURE, NOT AN ABSENCE, and that distinction is the
        //one this file is about.
        //
        //`missing` is meant for a fact about how the app was STARTED -- a
        //packaged build has no test plugins, so 'not asked for' is honest and a
        //skip is right. A window that is not connected is a fact about the app
        //being broken NOW, and reporting it the same way meant:
        //
        //    node tools/test.js core/remember/window
        //    ✔ the plugins, tested inside the app
        //    pass 1, fail 0
        //
        //against an app whose window had gone -- zero window suites run, and a
        //green run saying so. That is the shape this whole file exists to
        //prevent, arriving through the door left open for the packaged case.
        //
        //`stuck` IS ALREADY THE WORD FOR IT: a context that had something to run
        //and did not. A window that should be there and is not had all of it.
        if (!socket) {
            return Promise.resolve(absent('window',
                'no window is connected, so nothing in it could be run -- '
                + 'ask `node src/cli.js health` what main can still see', true));
        }

        return new Promise(function (resolve) {
            var timer = setTimeout(function () {
                //IT SAYS WHAT TO DO ABOUT IT, because the obvious reading is
                //wrong and expensive.
                //
                //A WINDOW SUITE THAT HANGS NEVER REACHES ITS `finally`, so it
                //leaves mounted views and raised banners in the live page. The
                //next run counts the leftovers, its own wait never comes true,
                //and it hangs too -- with the same message, which by then is
                //accusing whatever was edited most recently rather than the
                //thing that actually broke.
                //
                //Measured: one flaky assertion wedged this once, and afterwards
                //`tools/test.js ui/banner` failed identically against code that
                //was fine, through several rounds of bisecting the wrong thing.
                resolve(absent('window', 'the window did not answer within ' + timeout + 'ms. '
                    + 'A suite that hung earlier leaves mounted views and banners behind, and every '
                    + 'run after it hangs the same way -- so restart before believing this is about '
                    + 'the last thing you changed: `node tools/restart.js`', true));
            }, timeout);

            socket.emit('selftest:run', { only: only }, function (results) {
                clearTimeout(timer);
                resolve(Object.assign({ context: 'window' }, results || {}));
            });
        });
    }

    //the node half registers its own command as it loads, and this calls it
    //rather than opening a socket to ourselves to ask ourselves a question
    //THE NODE HALF GETS A DEADLINE, FOR THE SAME REASON THE WINDOW DOES.
    //
    //This used to await ipc.invoke with nothing behind it, so a server-side test
    //that never settled did not fail -- it hung, and took the whole run with it,
    //including the two contexts that had nothing wrong with them. A `stuck`
    //result is a failure and says which context; an unresolved promise is a
    //terminal that has to be interrupted and tells you nothing.
    //
    //Generous, because the node half's suites open real sockets, but finite.
    function fromServer(timeout, only) {
        if (ipc.commands().indexOf('selftest:server') < 0) {
            return Promise.resolve(absent('server', 'the node half did not load its tests'));
        }

        return new Promise(function (resolve) {
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                resolve(absent('server', 'the node half did not answer within ' + timeout + 'ms', true));
            }, timeout);

            ipc.invoke('selftest:server', { only: only }).then(function (out) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(out);
            }, function (e) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(absent('server', 'the node half threw: ' + (e && e.message), true));
            });
        });
    }

    var answered = ipc.handle('selftest', async function (data) {
        //which contexts were asked for. Nothing said means all of them; naming
        //one is how `npm test -- window` runs the browser suites and nothing
        //else, rather than waiting on the two it did not ask about.
        var only = (data && data.contexts) || null;
        function asked(name) { return !only || only.indexOf(name) >= 0; }

        //A PACKAGED BUILD HAS NO TESTS, AND SHOULD SAY SO IN THOSE WORDS.
        //
        //Each require.context that gathers them sits inside a check webpack
        //drops, so a package genuinely cannot load them. Without this it
        //answered three empty contexts and the runner reported "no tests ran in
        //the main context" three times -- which reads as something broken rather
        //than as a build that was never going to have any. Said out loud, the
        //runner reports them as skipped with the reason, which is what `missing`
        //is for.
        if (app.isPackaged) {
            var none = ['main', 'server', 'window'].map(function (name) {
                return absent(name, 'a packaged build cannot load its own tests');
            });
            return { contexts: none, passed: 0, failed: 0 };
        }

        function passedOver(name) {
            return { context: name, suites: [], passed: 0, failed: 0, missing: 'not asked for' };
        }

        var here = asked('main')
            ? Object.assign({ context: 'main' }, await mine.run(data))
            : passedOver('main');

        var server = asked('server')
            ? await fromServer((data && data.timeout) || 120000, data && data.only)
            : passedOver('server');

        //generous on purpose: the window suite opens every page and waits for
        //each to settle, which is slower than everything else here put together
        var window_ = asked('window')
            ? await fromWindow((data && data.timeout) || 120000, data && data.only)
            : passedOver('window');

        var all = [here, server, window_];

        return {
            contexts: all,
            passed: all.reduce(function (n, c) { return n + c.passed; }, 0),
            failed: all.reduce(function (n, c) { return n + c.failed; }, 0)
        };
    });

    await register(null, {
        selftest: mine,
        onDestroy: function () { answered.remove(); }
    });
}
module.exports = plugin;
