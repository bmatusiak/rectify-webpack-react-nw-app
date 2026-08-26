const { test } = require('node:test');
const assert = require('node:assert');

const Remembering = require('./remembering');

//WHERE YOU WERE, ASKED WITHOUT A WINDOW.
//
//Everything except the hook is answered here, because everything except the
//hook is a rule about a store -- and the states worth checking are ones a real
//browser will not hold still in: storage that throws, a value that is
//secret-shaped, a store asked the wrong way.
//
//THE FAKE IS FAITHFUL ON PURPOSE, and that is the whole point of this file.
//It reproduces ../webStorage's actual shape -- a property per key it was given
//a DEFAULT for -- because the bug this plugin exists to sidestep only appears
//against that shape. A convenient fake backed by a plain object would pass
//every test here and prove nothing.

function storeOn(memory, opts) {
    opts = opts || {};

    return function store(name, defaults) {
        if (opts.throws) throw new Error('storage is not available');

        memory[name] = memory[name] || {};
        var mem = memory[name];
        var obj = { save: function () { } };

        Object.keys(defaults || {}).forEach(function (k) {
            Object.defineProperty(obj, k, {
                get: function () { return mem[k]; },
                set: function (v) { mem[k] = v; },
                enumerable: true, configurable: true
            });

            if (obj[k] === undefined) obj[k] = defaults[k];
        });

        return obj;
    };
}

function warned() {
    const lines = [];
    const fn = function (line) { lines.push(line); };
    fn.lines = lines;
    return fn;
}

//---- the bug it exists to sidestep ----------------------------------------

//A STORE ASKED WITH `{}` HAS NO PROPERTIES, so a reader that does not name its
//key gets undefined off a store that is holding the value. This is the one test
//that would go green against a careless fake, and red against the real thing.
test('reads back a value the underlying store would not hand over', () => {
    const memory = {};
    const store = storeOn(memory);
    const remember = Remembering(store);

    assert.equal(remember.write('demo.ui', 'page', 'plumbing'), true);

    //what is really in storage
    assert.equal(memory['demo.ui'].page, 'plumbing');

    //and what ../webStorage answers when nobody names the key: nothing at all
    assert.equal(store('demo.ui', {}).page, undefined);

    //named, it comes back -- which is the whole of this plugin
    assert.equal(remember.read('demo.ui', 'page', 'first'), 'plumbing');
});

test('a fallback is what you get when nothing was kept, not undefined', () => {
    const remember = Remembering(storeOn({}));

    assert.equal(remember.read('demo.ui', 'page', 'first'), 'first');
    assert.equal(remember.read('nothing.here', 'nor.this', null), null);
});

//A VALUE ALREADY THERE WINS over the fallback handed in beside it. The default
//is only written when there is nothing, so passing today's value as the default
//cannot overwrite yesterday's.
test('a fallback never overwrites what is already kept', () => {
    const memory = { 'demo.ui': { page: 'plumbing' } };
    const remember = Remembering(storeOn(memory));

    assert.equal(remember.read('demo.ui', 'page', 'first'), 'plumbing');
    assert.equal(memory['demo.ui'].page, 'plumbing');
});

//---- the rule -------------------------------------------------------------

test('a credential is refused, and the refusal says why', () => {
    const memory = {};
    const warn = warned();
    const remember = Remembering(storeOn(memory), warn);

    const token = 'ghp_' + 'B'.repeat(36);

    assert.equal(remember.write('demo.ui', 'filter', token), false);
    assert.equal(memory['demo.ui'], undefined, 'it was written anyway');

    assert.equal(warn.lines.length, 1);
    assert.ok(warn.lines[0].indexOf('credential') > 0, warn.lines[0]);
    assert.ok(warn.lines[0].indexOf('demo.ui.filter') > 0, 'it does not say which key');
});

test('a credential inside a larger value is refused too', () => {
    const remember = Remembering(storeOn({}), warned());

    //what a pane would plausibly keep: the row it had selected, whose name
    //happens to be an authorization header somebody pasted
    assert.equal(remember.write('demo.ui', 'row',
        { id: 3, label: 'Bearer abcdefghijklmnop0123456789' }), false);
});

//WHAT SOMEBODY WAS LOOKING AT, rather than where they were looking. The check
//is a length and the rule is not -- see ./README.md -- but a value this size is
//content by any reading.
test('something the size of a document is refused, with its size in the sentence', () => {
    const warn = warned();
    const remember = Remembering(storeOn({}), warn);

    assert.equal(remember.write('demo.ui', 'draft', 'x'.repeat(5000)), false);
    assert.ok(warn.lines[0].indexOf('5000') > 0, warn.lines[0]);
});

test('an ordinary place is kept', () => {
    const remember = Remembering(storeOn({}), warned());

    assert.equal(remember.write('demo.ui', 'page', 'plumbing'), true);
    assert.equal(remember.write('demo.ui', 'open', true), true);
    assert.equal(remember.write('demo.ui', 'row', { id: 3, name: 'core/log' }), true);
    assert.equal(remember.write('demo.ui', 'scroll', 240), true);
});

//---- storage that is not there --------------------------------------------

//PRIVATE MODE AND A FULL DISK BOTH THROW, and neither is a reason for a window
//not to open. The fallback is the answer, and a write says it did not keep it.
test('a store that throws costs the fallback, not the window', () => {
    const remember = Remembering(storeOn({}, { throws: true }), warned());

    assert.equal(remember.read('demo.ui', 'page', 'first'), 'first');
    assert.equal(remember.write('demo.ui', 'page', 'plumbing'), false);
});

//---- the surface ----------------------------------------------------------

test('has the whole surface, not a narrower stand-in', () => {
    const remember = Remembering(storeOn({}));

    ['use', 'read', 'write', 'refuses'].forEach((fn) => {
        assert.equal(typeof remember[fn], 'function', fn + ' is missing');
    });

    //`refuses` is exposed so a caller can ask BEFORE it decides to keep
    //something, which is a question that cannot be asked after the fact
    assert.equal(remember.refuses('plumbing'), null);
    assert.ok(remember.refuses('ghp_' + 'C'.repeat(36)));
});
