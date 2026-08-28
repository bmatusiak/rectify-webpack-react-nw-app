//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE DOOR EVERYTHING ELSE COMES THROUGH. The cli, the MCP bridge, the
//drive tool and every `npm test` reach the app here -- and the stamp this file
//puts on a call is what ../may/deciding.js reads to decide whether anything is
//allowed at all.
//
//A BROKEN STAMP BREAKS NOTHING VISIBLY, which is why it is first below. Nothing
//crashes, no test fails, no dialog appears; every guarded capability simply
//starts saying yes. `snapshot` writes the screen down unasked, `serve` opens a
//port unasked, every MCP tool helps itself -- and the app looks exactly as it
//did the day before.
//
//IT HAD NO sabotage.js UNTIL 2026-08-27, and neither did anything test the
//stamp. Four capabilities had been built on top of it by then.

var entries = [
    //---- the gate a closed build hangs on this ------------------------------
    //
    //THE HOOK IS OURS AND THE RULE IS ../may's, which is what makes these
    //runnable at all. A closed build behaves differently from every build a
    //developer runs, so an entry that needed one would be an entry nobody runs
    //-- and ../../ui/theme/sabotage.js already argues those are worse than no
    //entry at all.
    //
    //./main.test.js INSTALLS ITS OWN GATE instead. The rule under test is "a
    //gate that says no is obeyed", and that holds in either stance: ../may
    //simply installs one that says yes to everything while the build is open.
    {
        //THE GATE NOT BEING ASKED AT ALL. One line, and a closed build answers
        //every command it has to anything that can open the socket -- the whole
        //feature undone, in code that looks perfectly well.
        what: 'a command is dispatched without the gate being asked',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '        var no = barred(msg.command);',
        replace: '        var no = null;'
    },
    {
        //ASKED AFTER THE HANDLER IS LOOKED UP RATHER THAN BEFORE. It reads
        //better and it hands out a map: a caller could tell a refused command
        //from one that does not exist and learn the whole surface a name at a
        //time, which is what filtering the listing was for.
        what: 'a refused command and a nonexistent one answer differently',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: "        var no = barred(msg.command);\n        if (no) return reply({ id: msg.id, ok: false, error: no });\n\n        var fn = handlers[msg.command];\n        if (!fn) return reply({ id: msg.id, ok: false, error: 'unknown command: ' + msg.command });",
        replace: "        var fn = handlers[msg.command];\n        if (!fn) return reply({ id: msg.id, ok: false, error: 'unknown command: ' + msg.command });\n\n        var no = barred(msg.command);\n        if (no) return reply({ id: msg.id, ok: false, error: no });"
    },
    {
        //THE LISTING GOING BACK TO NAMING EVERYTHING. `commands` is the first
        //thing anything driving an app asks for, and a caller that may not use
        //one has no business being told it is there.
        what: 'the listing advertises commands the gate will refuse',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '        return Object.keys(handlers).filter(function (name) { return !barred(name); }).sort();',
        replace: '        return Object.keys(handlers).sort();'
    },
    {
        //THE FIRST REFUSAL WINNING. With the loop returning nothing, every gate
        //is a no-op and the refusals are unanimous the other way, in silence.
        what: 'a gate that says no is asked and then ignored',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '            if (no) return no;',
        replace: '            //sabotaged'
    },
    {
        //AND A GATE THAT CANNOT BE TAKEN OFF. A hook whose remover does nothing
        //outlives the plugin that installed it -- and a stale gate refuses
        //commands on behalf of a rule nobody is running any more.
        what: 'removing a gate leaves it in place for the rest of the run',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '            if (i >= 0) gates.splice(i, 1);',
        replace: '            //sabotaged'
    },

    //---- where a call came from --------------------------------------------
    {
        //THE ONE THAT MATTERS MOST IN THE WHOLE APP.
        what: 'a call over the control socket is passed off as the app asking itself',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: 'await fn(msg.data || {}, { overTheWire: true, socket: socket });',
        replace: 'await fn(msg.data || {}, { overTheWire: false });'
    },
    {
        //THE STAMP TAKEN FROM THE DATA, which is the mistake the comment in
        //./main.js exists to prevent: the data belongs to whoever sent it, so
        //`{"overTheWire":false}` becomes one line in a json message away from
        //being a person at the window.
        what: 'the caller gets to say where it came from',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: 'var result = await fn(msg.data || {}, { overTheWire: true, socket: socket });',
        replace: 'var result = await fn(msg.data || {}, Object.assign({ overTheWire: true }, msg.data));'
    },
    {
        //THE OTHER DIRECTION. An in-process call marked as the wire is the SAFE
        //failure -- everything asks -- but it makes the app unusable by itself,
        //and a permission people cannot avoid is one they turn off.
        what: 'the app asking itself a question is taken for the control socket',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: 'return Promise.resolve(fn(data || {}, from || { overTheWire: false }));',
        replace: 'return Promise.resolve(fn(data || {}, { overTheWire: true }));'
    },
    {
        //WHAT A CALLER SAID ABOUT ITSELF, THROWN AWAY. ../bridge hands on what
        //the page said about the press and ../may reads it, so overwriting it
        //here means a person's own press stops counting as one -- and the
        //snapshot key starts raising a dialog asking whether you meant it.
        what: 'what an in-process caller said about itself is overwritten',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: 'fn(data || {}, from || { overTheWire: false })',
        replace: 'fn(data || {}, { overTheWire: false })'
    },

    //---- and who is allowed to talk at all ---------------------------------
    {
        //THE TOKEN STOPS BEING CHECKED. A named pipe on windows is reachable by
        //anyone logged into the machine and /tmp on posix is world-readable --
        //see ./endpoint.js -- so the socket being hard to find was never the
        //thing protecting it.
        what: 'any token is the right token',
        file: 'token.js',
        check: 'core/ipc/node',
        find: '    return crypto.timingSafeEqual(a, b);',
        replace: '    return true;'
    },
    {
        //THE GATE ITSELF. Authentication that is checked and then not consulted
        //is a login screen with no lock behind it.
        what: 'a client that never authenticated is served anyway',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '        if (!socket.trusted) return reply({',
        replace: '        if (false) return reply({'
    },
    {
        //A PREFIX OF THE TOKEN BEING ENOUGH. `startsWith` is the comparison
        //somebody reaches for, and it hands out the secret one character at a
        //time to anything patient.
        what: 'a prefix of the token is enough',
        file: 'token.js',
        check: 'core/ipc/node',
        find: '    if (a.length !== b.length) return false;',
        replace: '    if (a.length !== b.length) return String(secret).indexOf(String(given || \'\')) === 0;'
    },
];

//---- and one that only exists where it can be caught -----------------------
//
//THE TOKEN READABLE BY THE MACHINE RATHER THAN THE ACCOUNT. It is the one thing
//standing in front of a socket anybody logged in can reach, and a mode nobody
//applied is a mode nobody notices.
//
//IT IS NOT LISTED ON WINDOWS, because there `chmod` does not do the thing: it
//sets the read-only flag and nothing else, so 0600 and 0644 are the same call
//with the same result. ./main.test.js says so too -- it checks the mode on posix
//and, on windows, checks that a path exists, which is honest about proving
//nothing. What keeps the token private there is the per-user temp directory.
//
//SO THE ENTRY IS ABSENT RATHER THAN FAILING. It survived a run on windows and
//was reported as a check watching nothing -- which was true and was not the
//test's fault. A sabotage that cannot be caught on the machine it is running on
//teaches people to read past a red line, and that costs more than the coverage
//it pretends to.
if (process.platform !== 'win32') {
    entries.push({
        what: 'the token is left readable by anyone on the machine',
        file: 'main.js',
        check: 'core/ipc/main',
        restart: true,
        find: '        fs.chmodSync(tokenFile, 0o600);',
        replace: '        fs.chmodSync(tokenFile, 0o644);'
    });
}

module.exports = entries;
