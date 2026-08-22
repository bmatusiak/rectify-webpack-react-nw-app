const { test } = require('node:test');
const assert = require('node:assert');

const serve = require('../src/serve');

// Whether a browser may be a client of this app, and where.
//
// Two ways to say it and the flag wins -- a manifest field is how somebody who
// ships the app decides, a flag is how somebody running it decides once. Pure
// logic, so it is answered here rather than by starting an app to ask.
//
// IT ANSWERS false OR AN ADDRESS, never true, so that a caller who has to open
// a socket has somewhere to open it rather than repeating the guesses about
// defaults. `port: 0` is "whatever is free".

const ANYWHERE = { host: 'localhost', port: 0 };

test('a manifest that says nothing means no', () => {
    assert.equal(serve({}, []), false);
    assert.equal(serve({ app: {} }, []), false);
    assert.equal(serve(undefined, undefined), false);
});

// so that `if (app.serve)` reads the way it looks
test('off is falsy and on is truthy', () => {
    assert.ok(!serve({}, []));
    assert.ok(serve({}, ['--serve']));
});

test('true means localhost on whatever port is free', () => {
    assert.deepEqual(serve({ app: { serve: true } }, []), ANYWHERE);
    assert.deepEqual(serve({}, ['--serve']), ANYWHERE);
});

test('a bare number is a port on localhost', () => {
    assert.deepEqual(serve({ app: { serve: '8080' } }, []), { host: 'localhost', port: 8080 });
    assert.deepEqual(serve({ app: { serve: 8080 } }, []), { host: 'localhost', port: 8080 });
    assert.deepEqual(serve({}, ['--serve=8080']), { host: 'localhost', port: 8080 });
});

test('host:port is both', () => {
    assert.deepEqual(serve({ app: { serve: '0.0.0.0:8080' } }, []), { host: '0.0.0.0', port: 8080 });
    assert.deepEqual(serve({}, ['--serve=0.0.0.0:3000']), { host: '0.0.0.0', port: 3000 });
    assert.deepEqual(serve({}, ['--serve=127.0.0.1:0']), { host: '127.0.0.1', port: 0 });
});

// THE CASE THE FLAG EXISTS FOR: a build that ships with the viewer off, and
// somebody who wants it on once without editing anything.
test('the flag beats the manifest, both ways', () => {
    assert.deepEqual(serve({ app: { serve: false } }, ['--serve']), ANYWHERE);
    assert.deepEqual(serve({ app: { serve: true } }, ['--no-serve']), false);
    assert.deepEqual(serve({ app: { serve: '9000' } }, ['--serve=8080']), { host: 'localhost', port: 8080 });
});

// So that `--serve --no-serve` is a decision rather than a puzzle.
test('the last flag wins', () => {
    assert.equal(serve({}, ['--serve', '--no-serve']), false);
    assert.deepEqual(serve({}, ['--no-serve', '--serve']), ANYWHERE);
    assert.deepEqual(serve({}, ['--serve=1', '--serve=2']), { host: 'localhost', port: 2 });
});

test('the flags survive the other arguments around them', () => {
    assert.deepEqual(serve({}, ['--build', '--serve=8080', '--selftest']), { host: 'localhost', port: 8080 });
    assert.deepEqual(serve({ app: { serve: true } }, ['--build']), ANYWHERE);
});

// A NEAR MISS IS NOT A MATCH. `--serves` is not this flag, and quietly treating
// it as one would be worse than ignoring it: somebody would believe they had
// switched the viewer on.
test('only the exact flags count', () => {
    assert.equal(serve.asked(['--serves']), null);
    assert.equal(serve.asked(['serve']), null);
    assert.equal(serve.asked(['--serve-me=8080']), null);
    assert.equal(serve.asked([]), null);
});

test('asked says nothing when nothing was said, so the manifest can answer', () => {
    assert.equal(serve.asked(['--build']), null);
    assert.equal(serve.asked(['--serve']), true);
    assert.equal(serve.asked(['--no-serve']), false);
    assert.equal(serve.asked(['--serve=8080']), '8080');
});

// NONSENSE IS SAID ALOUD RATHER THAN HIDDEN. Answering the defaults silently
// would leave somebody believing they were listening on an address they typed
// wrong; refusing to serve at all would be a worse surprise than serving
// somewhere findable.
test('an address it cannot read falls back, loudly', () => {
    assert.equal(serve.address('nonsense'), null);
    assert.equal(serve.address('localhost:'), null);
    assert.equal(serve.address('localhost:abc'), null);

    assert.deepEqual(serve({ app: { serve: 'nonsense' } }, []), ANYWHERE);
});

test('an empty string is on, at the default address', () => {
    assert.deepEqual(serve.address(''), ANYWHERE);
    assert.deepEqual(serve.address(true), ANYWHERE);
    assert.equal(serve.address(false), null);
});
