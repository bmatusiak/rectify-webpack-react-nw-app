//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//EVERY ENTRY HERE IS A WAY OF SAYING "PROTECTED" ABOUT SOMETHING THAT IS NOT.
//That is the only failure this plugin has. One that refuses to seal is loud and
//somebody fixes it; one that seals nothing and reports success writes a
//credential in cleartext into a folder that gets backed up, synced, zipped into
//a support bundle and read somewhere else -- which is the exact threat
//./seal.js says it exists to answer.
//
//THE PAIR `{ data, sealed }` IS THE WHOLE DESIGN, and most of these attack the
//second half of it. A plugin that does less on a platform is fine; one that lies
//about which it did is not.

var entries = [
    //---- sealing, and saying honestly whether it happened -------------------
    {
        //THE WORST ONE. Cleartext handed back with `sealed: true` on it, so a
        //caller that asked "can you protect this" is told yes, and a screen that
        //reports protection reports it truthfully as far as it can tell.
        what: 'cleartext is handed back with a claim that it was sealed',
        file: 'seal.js',
        check: 'core/secret/node',
        find: "    var out = powershell(PROTECT, raw.toString('base64'));\n    return { data: Buffer.from(MARK + out, 'utf8'), sealed: true };",
        replace: '    return { data: raw, sealed: true };'
    },
    {
        //WHAT IS ON DISK, REPORTED WITHOUT OPENING IT. A screen saying "sealed"
        //about a file that predates sealing -- or was written by hand -- is the
        //same lie one step further from the code.
        what: 'anything on disk is reported as ciphertext',
        file: 'seal.js',
        check: 'core/secret/node',
        find: '    return text.indexOf(MARK) === 0;',
        replace: '    return true;'
    },

    //---- and the payload, which must not be published to the machine --------
    {
        //THE ONE THING THIS FILE DOES DIFFERENTLY from the implementation it is
        //modelled on. On windows any process can read any other process's
        //command line -- this repo's own tools/profile-tests.js does exactly
        //that to find leftover test runs -- so a secret passed as an argument is
        //a secret published to every process on the machine for as long as the
        //spawn lives, which undoes the entire point of sealing it.
        //
        //PINNED TO `PROTECT`, because `UNPROTECT` has the same line and the tool
        //refuses a pattern that matches twice. Rightly: a sabotage that breaks
        //two things does not say which one the check noticed.
        what: 'the value is spliced into the powershell command line',
        file: 'seal.js',
        check: 'core/secret/node',
        find: "var PROTECT = [\n    'Add-Type -AssemblyName System.Security',\n    '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',",
        replace: "var PROTECT = [\n    'Add-Type -AssemblyName System.Security',\n    '$b = [Convert]::FromBase64String('SPLICED')',"
    },

    //---- and what a name is allowed to be ----------------------------------
    {
        //A NAME BECOMES A FILE. Sanitising `../../etc/passwd` into something
        //safe writes a file somewhere surprising and says nothing; refusing it
        //names the mistake where the mistake was made.
        what: 'a name that could escape the folder is sanitised rather than refused',
        file: 'main.js',
        check: 'core/secret/main',
        restart: true,
        find: '    if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) {',
        replace: '    if (false) {'
    },
    {
        //A HALF-WRITTEN SECRET IS A LOST ONE. It is written beside and moved
        //into place, so a reader gets either the whole of the old file or the
        //whole of the new -- never the middle of either.
        what: 'the file is written in place, so an interrupted write loses it',
        file: 'main.js',
        check: 'core/secret/main',
        restart: true,
        find: '                fs.writeFileSync(beside, out.data, { mode: 0o600 });',
        replace: '                fs.writeFileSync(file, out.data, { mode: 0o600 });'
    }
];

//---- and the ones that only exist where they can be caught -----------------
//
//THREE OF THESE ARE ABOUT THE PLATFORM THAT CANNOT SEAL, and they cannot fail on
//the one that can. On windows the `!WINDOWS` branch never runs, `can()` already
//answers true, and `chmod` sets the read-only flag and nothing else -- so 0600
//and 0644 are the same call with the same result. ./main.test.js says as much:
//it checks the mode on posix and checks that a path exists on windows, which is
//honest about proving nothing.
//
//LISTED ONLY WHERE THEY CAN FAIL, the same as ../ipc's. All three survived a run
//here and were reported as checks watching nothing -- which was true, and was
//not the tests' fault. A sabotage that cannot be caught on the machine it is
//running on teaches people to read past a red line, and that costs more than the
//coverage it pretends to.
if (process.platform !== 'win32') {
    entries.push({
        //THE SAME LIE FROM THE OTHER PLATFORM. Nothing seals off windows, which
        //is fine and documented -- claiming otherwise is not.
        what: 'a platform that cannot seal says it did',
        file: 'seal.js',
        check: 'core/secret/node',
        find: '    if (!WINDOWS) return { data: raw, sealed: false };',
        replace: '    if (!WINDOWS) return { data: raw, sealed: true };'
    });

    entries.push({
        //`can()` IS ASKED BEFORE ANYTHING IS KEPT. "I will store this if you can
        //protect it" is a reasonable policy and it cannot be expressed after the
        //fact -- so a `can` that always says yes turns that policy into storing
        //it anyway.
        what: 'it claims every machine can protect a secret',
        file: 'seal.js',
        check: 'core/secret/node',
        find: 'module.exports.can = function can() { return WINDOWS; };',
        replace: 'module.exports.can = function can() { return true; };'
    });

    entries.push({
        what: 'the sealed file is left readable by anyone on the machine',
        file: 'main.js',
        check: 'core/secret/main',
        restart: true,
        find: '                fs.writeFileSync(beside, out.data, { mode: 0o600 });',
        replace: '                fs.writeFileSync(beside, out.data, { mode: 0o644 });'
    });
}

module.exports = entries;
