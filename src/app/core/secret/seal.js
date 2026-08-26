var cp = require('node:child_process');

//SEALING, AND WHAT IT DOES AND DOES NOT PROTECT AGAINST.
//
//IT DOES NOT PROTECT AGAINST SOMEBODY RUNNING AS YOU on this machine. Nothing on
//a single-user desktop can, and pretending otherwise is how a false sense of
//safety gets built. It protects against the file being read SOMEWHERE ELSE:
//copied into a backup, synced to a cloud folder, pulled off the disk, handed
//over in a support bundle, or picked up by a process running as another account
//or as an administrator. That is the realistic threat for a credential on a
//workstation, and a plain file loses to all of it.
//
//ON WINDOWS: DPAPI, through powershell, which is always there. The key is
//derived from the logged-in account BY THE OPERATING SYSTEM, so there is no key
//of ours to store -- and a key stored next to the thing it encrypts is not
//encryption, it is filing.
//
//ELSEWHERE: the file's own permissions, which are real on those systems. Nothing
//is pretended -- `sealed` says which of the two happened, so a caller can tell
//protected-at-rest from merely-not-readable-by-others rather than assuming the
//stronger one. This is the difference between a plugin that does less on a
//platform and one that lies about it.

var WINDOWS = process.platform === 'win32';

//MARKS A FILE AS CIPHERTEXT. Without it, a file written before this existed --
//or on another platform, or by hand -- would be fed to the decryptor and fail as
//corruption rather than as "this one was never sealed".
var MARK = 'dpapi-v1:';

module.exports.MARK = MARK;
module.exports.WINDOWS = WINDOWS;

//THE PAYLOAD GOES OVER STDIN, NOT THE COMMAND LINE, and that is the one place
//this differs from the implementation it is modelled on.
//
//On windows any process can read any other process's command line -- this repo's
//own tools/profile-tests.js does exactly that to find leftover test runs. So a
//secret passed as an argument is a secret published to every process on the
//machine for as long as the spawn lives, which would undo the entire point of
//sealing it.
//
//AND NOT A TEMPORARY FILE EITHER, which is the other obvious way: cleartext on
//disk, however briefly, is cleartext on disk -- and if the process dies between
//writing and deleting it stays there.
function powershell(script, input) {
    return cp.execFileSync(
        process.env.SystemRoot
            ? process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
            : 'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
            input: input,
            encoding: 'utf8',
            timeout: 30000,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        }
    ).trim();
}

var PROTECT = [
    'Add-Type -AssemblyName System.Security',
    '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    '[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect(' +
        '$b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))'
].join('; ');

var UNPROTECT = [
    'Add-Type -AssemblyName System.Security',
    '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    '[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect(' +
        '$b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))'
].join('; ');

//WHAT TO WRITE, AND WHETHER IT IS REALLY SEALED. The answer is a pair on purpose:
//a caller that wants to say "protected" on a screen must not have to infer it
//from the platform.
module.exports.seal = function seal(value) {
    var raw = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');

    if (!WINDOWS) return { data: raw, sealed: false };

    var out = powershell(PROTECT, raw.toString('base64'));
    return { data: Buffer.from(MARK + out, 'utf8'), sealed: true };
};

module.exports.open = function open(value) {
    var raw = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    var text = raw.toString('utf8');

    //NOT SEALED, which is the ordinary case on every platform but one -- and
    //also what a file written before any of this existed looks like
    if (text.indexOf(MARK) !== 0) return raw;

    //A SEALED FILE ON THE WRONG MACHINE IS NOT CORRUPTION, and saying which it is
    //saves somebody an afternoon. DPAPI's key belongs to one account on one
    //machine, so this is unopenable rather than damaged.
    if (!WINDOWS) {
        throw new Error('this was sealed on windows and can only be opened there, ' +
            'by the account that sealed it');
    }

    return Buffer.from(powershell(UNPROTECT, text.slice(MARK.length).trim()), 'base64');
};

//WHETHER WHAT IS ON DISK IS CIPHERTEXT, without opening it -- so a screen can
//report the truth rather than a claim, and so a file that predates sealing can
//be noticed rather than assumed.
module.exports.isSealed = function isSealed(value) {
    if (value === null || value === undefined) return false;

    var text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    return text.indexOf(MARK) === 0;
};

//AND WHETHER THIS MACHINE CAN SEAL AT ALL, which a caller needs BEFORE it
//decides to keep something -- "I will store this if you can protect it" is a
//reasonable policy and it cannot be expressed after the fact.
module.exports.can = function can() { return WINDOWS; };
