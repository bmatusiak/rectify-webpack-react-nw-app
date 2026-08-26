const { test } = require('node:test');
const assert = require('node:assert');

const looksLike = require('./looks-like');

//WHAT A SECRET LOOKS LIKE, ASKED WITHOUT AN APP.
//
//This is the half of the log that must never be wrong, and it is pure text --
//so it is answered here in a millisecond rather than inside a running window.
//The failure it guards against already happened once in the app this came from:
//a github token was not redacted at all, and sat in a log somebody was reading.

//---- what must never survive ---------------------------------------------

test('a github token never survives, whichever kind it is', () => {
    ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'].forEach((prefix) => {
        const token = prefix + 'A'.repeat(36);
        const out = looksLike.redact('cloning with ' + token + ' now');

        assert.ok(out.indexOf(token) < 0, prefix + ' survived: ' + out);
        assert.ok(out.indexOf('[redacted]') >= 0);
    });
});

test('a bearer token never survives', () => {
    const out = looksLike.redact('Authorization: Bearer abcdefghijklmnop0123456789');

    assert.ok(out.indexOf('abcdefghijklmnop') < 0, out);
    assert.ok(out.indexOf('Authorization') >= 0, 'it redacted the header name too: ' + out);
});

test('a private key goes whole, not line by line', () => {
    const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\ndef\n-----END OPENSSH PRIVATE KEY-----';
    const out = looksLike.redact('here it is:\n' + key + '\nand that was it');

    assert.ok(out.indexOf('abc') < 0, out);
    assert.ok(out.indexOf('BEGIN') < 0, 'the header survived: ' + out);
    assert.ok(out.indexOf('and that was it') >= 0, 'it ate the text after the key');
});

//THE NAME IS WHAT MAKES A VALUE SAFE TO BE SURE ABOUT. `token=abc123` is a
//credential; `abc123` on its own is indistinguishable from an id.
test('a named credential loses its value and keeps its name', () => {
    [
        'https://example.com/x?access_token=sekret123456&page=2',
        'password=hunter2',
        'api_key: "abcdef123456"',
        "SECRET='abcdef123456'",
        'refresh-token=abcdef123456'
    ].forEach((line) => {
        const out = looksLike.redact(line);

        assert.ok(/redacted/.test(out), 'nothing was redacted in: ' + line);
        assert.ok(!/sekret123456|hunter2|abcdef123456/.test(out), 'the value survived: ' + out);
    });

    //KEEPING THE NAME IS THE POINT. `[redacted]` alone is a hole in the log;
    //`access_token=[redacted]` still says what was there.
    const url = looksLike.redact('https://example.com/x?access_token=sekret123456&page=2');
    assert.ok(url.indexOf('access_token') >= 0, url);
    assert.ok(url.indexOf('page=2') >= 0, 'it ate what came after: ' + url);
});

//---- and what must survive, which is the harder half ---------------------

//NARROW ON PURPOSE. The blunt rule -- anything long and random -- would redact
//commit hashes, base64 and ids, which is most of what makes a log worth reading.
//A redactor that eats the log is one somebody turns off.
test('the things a log is actually made of are left alone', () => {
    [
        'HEAD is now at 4f2c1ab9d3e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
        'GET /window.js 200 in 43ms',
        'listening on http://localhost:49965/',
        'wrote dist/server.js, 1.2 MB',
        'core/io: a view connected, session browser-1',
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8'
    ].forEach((line) => {
        assert.equal(looksLike.redact(line), line, 'it redacted something ordinary: ' + line);
    });
});

test('nothing in, nothing out, and no crash on either', () => {
    assert.equal(looksLike.redact(''), '');
    assert.equal(looksLike.redact(null), null);
    assert.equal(looksLike.redact(undefined), undefined);
    assert.equal(looksLike.redact(42), '42');
});

//`looksSecret` IS FOR A CALLER THAT WANTS TO REFUSE RATHER THAN REDACT -- a
//durable record would. The log itself redacts, because a log that dropped lines
//would be lying about what happened.
test('it can be asked whether it would change anything', () => {
    assert.equal(looksLike.looksSecret('ghp_' + 'A'.repeat(36)), true);
    assert.equal(looksLike.looksSecret('GET /window.js 200'), false);
});
