var cp = require('child_process');
var speech = require('./speech');

//SPEAKING FROM THE NODE HALF, which is the same service under the same name as
//./window.js and a different implementation -- the pattern `io`, `ipc`, `tray`
//and `window` all follow. A plugin that wants to say something says
//`consumes: ['tts']` and is written once.
//
//WHY THIS HALF EXISTS AT ALL, given the page can speak: the page is not always
//there. A packaged build with the window hidden, the terminal driving the app,
//a linux box whose chromium found no voices -- in each of those the DOM route
//has nothing, and the OS synthesizer is still right there. This is also the only
//route that can render speech to a FILE, which no Web Speech API can.
//
//IT SHELLS OUT, and that is the design rather than a shortcut. The alternative
//is a native module -- `say`, `node-tts`, an FFI into SAPI -- which means a
//build step, a prebuild per platform and per node version, and a dependency
//this scaffold otherwise does not have. What is being asked for is one line of
//powershell; the cost of a compiler to say it is not worth paying.

plugin.consumes = ['ipc', 'io', 'Plugin'];
plugin.provides = ['tts'];
async function plugin(imports, register) {
    var ipc = imports.ipc;
    var io = imports.io;
    var self = new imports.Plugin('tts');

    //EVERY CHILD THIS STARTED, so a reload can take them with it. The node half
    //is torn down and rebuilt on every save, and a synthesizer spawned by the
    //build before this one goes on talking to a room where nothing is listening
    //-- with no handle left anywhere to stop it. Found by editing this file
    //while it was mid sentence.
    var running = new Set();

    function run(spec, collect) {
        return new Promise(function (resolve, reject) {
            var child = cp.spawn(spec.cmd, spec.args, {
                env: Object.assign({}, process.env, spec.env || {}),

                //a console window flashing on screen every time the app says
                //something is worse than the app staying quiet
                windowsHide: true
            });

            running.add(child);

            var out = '';
            var err = '';

            if (collect && child.stdout) child.stdout.on('data', function (d) { out += d; });
            if (child.stderr) child.stderr.on('data', function (d) { err += d; });

            function done(fn) {
                return function (value) {
                    running.delete(child);
                    fn(value);
                };
            }

            //A MISSING BINARY IS NOT A FAILED ONE. `error` fires when the thing
            //could not be started at all, which on linux means espeak-ng is not
            //installed -- a different problem with a different answer, so it is
            //not folded into the exit code below.
            child.on('error', done(function (e) {
                reject(Object.assign(new Error(spec.cmd + ' is not installed'), { missing: true, cause: e }));
            }));

            child.on('close', done(function (code) {
                if (code === 0) return resolve(out);

                //null means it was killed, which is what stop() and a reload do.
                //That is not an error to report to whoever asked -- it is the
                //answer to something they or the app already decided.
                if (code === null) return resolve(out);

                reject(new Error(spec.cmd + ' exited ' + code + (err ? ': ' + err.trim() : '')));
            }));
        });
    }

    //espeak-ng is the modern name and plenty of distributions still ship the old
    //one. Trying the second only when the first was never there keeps a real
    //failure -- bad arguments, no audio device -- from being retried as if it
    //were a naming problem.
    async function runOrThen(spec, collect) {
        try {
            return await run(spec, collect);
        } catch (e) {
            if (!e.missing || !spec.then) throw e;
            return await run(Object.assign({}, spec, { cmd: spec.then }), collect);
        }
    }

    //KILLING THE CHILD IS NOT STOPPING THE SPEECH, which took a measurement to
    //believe. A paragraph is several children, one after another -- so `stop()`
    //killed the sentence being read and the loop below cheerfully started the
    //next one, and the whole paragraph still took eleven seconds to get through.
    //
    //So stopping is a NUMBER, not a signal: every speak() takes the count it
    //started under and gives up the moment it changes. That also covers a second
    //speak() arriving while the first is mid paragraph, which is the same
    //problem wearing different clothes.
    var generation = 0;

    function stop() {
        generation++;

        running.forEach(function (child) {
            try { child.kill(); } catch (e) { /* already gone */ }
        });
        running.clear();
    }

    async function speak(text, opts) {
        opts = opts || {};
        text = String(text === undefined || text === null ? '' : text);

        //the same refusal the window makes, for the same reason: an empty string
        //is almost always a variable that was not what its name said
        if (!text.trim()) throw new Error('there is nothing to say');

        if (!opts.enqueue) stop();
        var mine = generation;

        //CHUNKED HERE TOO, THOUGH NOTHING MAKES IT NECESSARY. SAPI will read a
        //page without complaint. It is done so that `stop()` lands within a
        //sentence rather than at the end of the paragraph, and so that both
        //halves of this plugin break text in the same places -- a caller
        //comparing them should hear the same reading, not two.
        var parts = speech.chunk(text, opts.max);
        var spoken = 0;

        for (var at = 0; at < parts.length; at++) {
            if (mine !== generation) break;
            await runOrThen(speech.command(parts[at], opts), false);
            spoken++;
        }

        //STOPPED IS NOT FAILED. Whoever called stop() knows why it is quiet, and
        //an exception would make the caller handle something it asked for -- so
        //the answer says how much was said instead.
        return { route: 'node', parts: spoken, stopped: mine !== generation };
    }

    async function voices() {
        try {
            var out = await runOrThen(speech.voicesCommand(), true);
            return speech.voicesFrom(out);
        } catch (e) {
            //A MACHINE WITH NO SYNTHESIZER ANSWERS "NONE", not a stack trace.
            //It is the ordinary state of a bare linux container, and a caller
            //deciding whether to offer a voice picker wants a list it can be
            //empty rather than an exception it has to catch.
            if (e.missing) return [];
            throw e;
        }
    }

    //---- how the rest of the app reaches this ---------------------------------

    var handlers = [
        //`say` rather than `tts:say`, because it is a verb somebody types:
        //`node src/cli.js say "the build is done"`. ../../app/remote names
        //`click`, `fill` and `read` the same way, and for the same reason.
        ipc.handle('say', async function (data) {
            data = data || {};
            return await speak(data.text, data);
        }),

        ipc.handle('voices', async function () {
            return { voices: await voices() };
        })
    ];

    //`ipc.handle` hands back a handle with `.remove()`, and this half is rebuilt
    //on every save -- a handler left behind is a second copy answering the next
    //call.
    self.own(function () {
        handlers.forEach(function (handle) {
            try { handle.remove(); } catch (e) { /* already gone */ }
        });
    });

    //AND THE PAGE, WHICH CANNOT USE ipc. ./window.js falls back to this when
    //chromium found no voices, and calls it deliberately for `via: 'node'`.
    //The ack is the reply -- see ../../app/core/io.
    //
    //TAKING THE `connection` LISTENER OFF IS NOT ENOUGH, and the difference is
    //invisible until it is not. Every reload of this half registers `heard`
    //again, and io hands a late listener the sockets that are ALREADY connected
    //-- so the window collected another `tts:speak` handler per save, all of
    //them live, all of them belonging to builds that no longer exist.
    //
    //One emit then ran speak() several times over. Each new one calls stop(),
    //which supersedes the one before it, so the ack that got back to the page
    //was from the run that had been cut off: `{ parts: 1, stopped: true }` for a
    //two part sentence, on an app that had simply been left running a while.
    //
    //So every handler this plugin puts on a socket is remembered and taken off
    //again. ../../app/remote/window.js does the same on its side.
    var wired = new Map();

    function heard(socket) {
        if (wired.has(socket)) return;

        //stopping is the page's to ask for as much as speaking is: it may have
        //handed a paragraph over here, and its own cancel() reaches none of it
        function asked() { stop(); }

        function said(data, ack) {
            if (typeof ack != 'function') return;//nobody is waiting

            data = data || {};
            speak(data.text, data.opts).then(ack, function (e) {
                ack({ error: (e && e.message) || String(e) });
            });
        }

        socket.on('tts:stop', asked);
        socket.on('tts:speak', said);

        wired.set(socket, function () {
            socket.off('tts:stop', asked);
            socket.off('tts:speak', said);
        });
    }

    io.on('connection', heard);

    self.own(function () {
        io.off('connection', heard);
        wired.forEach(function (undo) {
            try { undo(); } catch (e) { /* the socket is already gone */ }
        });
        wired.clear();
    });

    //the children go last, so a teardown that is also a reload cannot leave one
    //behind while the handlers above are still being removed
    self.own(stop);

    await register(null, {
        tts: self.api({
            speak: speak,
            stop: stop,
            voices: voices,

            //THE COMMAND WITHOUT RUNNING IT. What this half would say, and how,
            //is the only part of the node route that can be checked without
            //making a sound -- so it is offered rather than kept private, and
            //./server.test.js asks it for all three platforms on one machine.
            command: speech.command,

            get speaking() { return running.size > 0; },
            able: async function () { return (await voices()).length > 0; }
        }),
        onDestroy: self.unload
    });
}
module.exports = plugin;
