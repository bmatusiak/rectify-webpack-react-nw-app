const { test } = require('node:test');
const assert = require('node:assert');

const seal = require('./seal');

//SEALING, ASKED WITHOUT AN APP.
//
//On windows this really does call DPAPI, so the round trip below is the actual
//mechanism rather than a stand-in. Everywhere else it checks the honest
//fallback, which is the half that matters more: a plugin that quietly did
//nothing on a platform it could not protect would be worse than one that says so.

test('what it can do is a fact about the platform, and it says which', () => {
    assert.equal(typeof seal.can(), 'boolean');
    assert.equal(seal.can(), process.platform === 'win32');
});

//THE ROUND TRIP. Sealed on the way out, the same bytes on the way back.
test('a value survives being sealed and opened', () => {
    const secret = 'ghp_' + 'A'.repeat(36) + ' and a passphrase with "quotes" in it';
    const out = seal.seal(secret);

    assert.equal(seal.open(out.data).toString('utf8'), secret);
});

test('it says whether it really sealed, rather than letting you assume', () => {
    const out = seal.seal('anything');

    assert.equal(out.sealed, seal.can(),
        'it claims sealed=' + out.sealed + ' on a platform that can=' + seal.can());

    //and the mark is on the file only when it really is ciphertext
    assert.equal(seal.isSealed(out.data), seal.can());
});

//A FILE WRITTEN BEFORE ANY OF THIS EXISTED -- or by hand, or on another platform
//-- is not corruption. Without the mark it would be fed to the decryptor and
//fail as damage rather than as "this one was never sealed".
test('an unsealed value passes straight through', () => {
    const plain = Buffer.from('never sealed, just a file');

    assert.equal(seal.isSealed(plain), false);
    assert.equal(seal.open(plain).toString('utf8'), 'never sealed, just a file');
});

test('nothing is not something', () => {
    assert.equal(seal.isSealed(null), false);
    assert.equal(seal.isSealed(undefined), false);
    assert.equal(seal.isSealed(''), false);
});

//THE PAYLOAD MUST NOT REACH A COMMAND LINE. On windows any process can read any
//other process's command line -- this repo's own tools/profile-tests.js does
//exactly that -- so a secret passed as an argument is a secret published to the
//whole machine for as long as the spawn lives.
//
//WHAT IS CHECKED IS THE SOURCE, because the spawn is over in milliseconds and
//racing it would be a test that passes when the machine is busy.
test('the value goes over stdin, never as an argument', () => {
    const source = require('node:fs').readFileSync(require.resolve('./seal'), 'utf8');

    assert.ok(/input:\s*input/.test(source), 'the payload is not passed as stdin');
    assert.ok(/\[Console\]::In\.ReadToEnd/.test(source), 'the script does not read stdin');

    //and the base64 is never concatenated into the script itself
    assert.ok(!/FromBase64String\('/.test(source),
        'a value is being spliced into the powershell command line');
});

//BINARY SURVIVES, because a credential is not always text -- a key file is
//bytes, and base64 round-tripping is where that quietly breaks.
test('bytes come back as the same bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 0, 255]);
    const out = seal.seal(bytes);

    assert.equal(Buffer.compare(seal.open(out.data), bytes), 0, 'the bytes changed');
});
