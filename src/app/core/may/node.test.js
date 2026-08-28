const { test } = require('node:test');
const assert = require('node:assert');

const deciding = require('./deciding');

//WHAT AN ANSWER MEANS, ASKED WITHOUT AN APP.
//
//This is the half that must never be wrong, and it is a decision about three
//values -- so it is answered here in a millisecond rather than by driving a
//window. The prompting and the file are ./main.js's, and they are the easy part.

//---- who may decide ------------------------------------------------------

//THE ONE RULE THE REST IS BUILT ON. A guard the command line can remove is a
//comment, and every refusal downstream becomes one you have to trust a model
//not to have unlocked first.
test('a decision cannot be made over the wire', () => {
    const no = deciding.mayDecide({ overTheWire: true });

    assert.ok(no, 'the control socket was allowed to decide');
    assert.ok(no.indexOf('open the window') > 0, no);
});

//A DRIVEN CLICK ARRIVES BY EXACTLY THE PATH A REAL PRESS DOES, so nothing but
//the browser's own `isTrusted` tells them apart -- see remote/window.js, which
//builds and dispatches its events.
test('an untrusted press is not a person', () => {
    const no = deciding.mayDecide({ window: true, trusted: false });

    assert.ok(no, 'a synthetic click was taken for a person');
    assert.ok(no.indexOf('untrusted') > 0, no);
});

test('a person at the window may decide', () => {
    assert.equal(deciding.mayDecide({ window: true, trusted: true }), null);
});

//NOWHERE IS NOT SOMEWHERE. A caller that forgot to say where it came from must
//not be treated as the most privileged one.
test('a decision from nowhere is refused', () => {
    assert.ok(deciding.mayDecide(null));
    assert.ok(deciding.mayDecide({}));
});

//---- and whether a person just did it ------------------------------------
//
//THE SAME QUESTION, ASKED FOR A DIFFERENT PURPOSE. `mayDecide` asks it to write
//an answer down; this asks it to go ahead and do the thing. One rule and not
//two, so a break in either direction shows up in both.

//THE CASE IT EXISTS FOR. Without it, a person pressing ctrl+shift+D got a dialog
//asking whether they had meant to press ctrl+shift+D -- see debug-snapshot,
//which is the first capability whose code lives in main rather than in the page.
test('a person at the window did it themselves', () => {
    assert.equal(deciding.personDid({ window: true, trusted: true }), true);
});

//AND EVERY WAY OF NOT BEING ONE. This is the direction that matters: taken the
//wrong way, `may()` hands out every undecided capability to anything that asks,
//and no dialog is ever raised to notice it.
test('nothing else did it themselves', () => {
    assert.equal(deciding.personDid({ overTheWire: true }), false, 'the control socket');
    assert.equal(deciding.personDid({ window: true, trusted: false }), false, 'a driven press');
    assert.equal(deciding.personDid({}), false, 'a caller that said nothing');
    assert.equal(deciding.personDid(null), false, 'a caller that was nothing');

    //BOTH AT ONCE IS STILL THE WIRE. Nothing constructs this today -- ../ipc
    //stamps `overTheWire` itself and a caller cannot reach past it -- but a rule
    //that only holds because of what happens to call it is not a rule.
    assert.equal(deciding.personDid({ overTheWire: true, window: true, trusted: true }), false,
        'a wire call claiming to be a press');
});

//---- what is remembered --------------------------------------------------

test('what nothing guards is simply allowed', () => {
    const out = deciding.verdict('anything', { declared: false });

    assert.equal(out.allowed, true);
    assert.ok(!out.ask, 'it wanted to ask about something nobody guards');
});

test('a guarded thing with no answer is a question, not a refusal', () => {
    const out = deciding.verdict('serve', { declared: true });

    assert.equal(out.allowed, false);
    assert.equal(out.ask, true, 'it refused instead of asking');
});

test('always and never are remembered, and never wins nothing', () => {
    assert.equal(deciding.verdict('serve', { declared: true, kept: 'always' }).allowed, true);
    assert.equal(deciding.verdict('serve', { declared: true, kept: 'never' }).allowed, false);
    assert.ok(!deciding.verdict('serve', { declared: true, kept: 'never' }).ask,
        'a never was treated as a question');
});

test('an answer for this run is honoured while the run lasts', () => {
    assert.equal(deciding.verdict('serve', { declared: true, runwise: 'always' }).allowed, true);
    assert.equal(deciding.verdict('serve', { declared: true, runwise: 'never' }).allowed, false);
});

//WHAT IS WRITTEN DOWN BEATS WHAT WAS SAID THIS RUN, because a person who set
//`never` and then answered a prompt carelessly should keep the answer they took
//the trouble to record.
test('what was written down beats what was said this run', () => {
    const out = deciding.verdict('serve', { declared: true, kept: 'never', runwise: 'always' });
    assert.equal(out.allowed, false);
});

//---- failing shut --------------------------------------------------------

//THE WRONG ANSWER IN ONE DIRECTION COSTS SOMEBODY A PRESS. The wrong answer in
//the other is something nobody agreed to.
test('an unreadable file trusts nothing that was remembered', () => {
    const out = deciding.verdict('serve', { declared: true, kept: 'always', unreadable: 'broken' });

    assert.equal(out.allowed, false, 'a remembered yes survived the file being unreadable');
    assert.equal(out.ask, true);
    assert.ok(out.why.indexOf('broken') > 0, out.why);
});

test('an empty file and an unreadable one are different answers', () => {
    assert.equal(deciding.read(null).unreadable, null);
    assert.equal(deciding.read({}).unreadable, null);
    assert.deepStrictEqual(deciding.read({}).decisions, {});

    assert.ok(deciding.read('not a document').unreadable);
    assert.ok(deciding.read({ decisions: 'nonsense' }).unreadable);
});

//A ROW THAT MAKES NO SENSE POISONS THE WHOLE FILE rather than being skipped.
//Skipping it would quietly drop a `never` somebody had set, which is the one
//direction this must never fail in.
test('one answer nobody understands makes the whole file untrusted', () => {
    const out = deciding.read({
        decisions: {
            serve: { answer: 'always' },
            markup: { answer: 'sometimes' }
        }
    });

    assert.ok(out.unreadable, 'it kept going with an answer it did not understand');
    assert.deepStrictEqual(out.decisions, {}, 'it kept the rows it did understand');
});

//`once` AND `run` MUST NOT BE IN THE FILE. Storing `once` is a contradiction,
//and a stored `run` would outlive the run it was for.
test('only always and never are ever written down', () => {
    assert.equal(deciding.keeps('always'), true);
    assert.equal(deciding.keeps('never'), true);
    assert.equal(deciding.keeps('once'), false);
    assert.equal(deciding.keeps('run'), false);

    assert.ok(deciding.read({ decisions: { serve: { answer: 'once' } } }).unreadable,
        'a `once` in the file was accepted');
});

test('the answers are the four a person can give', () => {
    assert.deepStrictEqual(deciding.ANSWERS, ['once', 'run', 'always', 'never']);
});

//---- and whether this build is open at all --------------------------------
//
//THE OTHER HALF OF THE SAME QUESTION, and the reason ./stance.js is a module.
//A closed build behaves differently from every build a developer ever runs, so
//without this the closed branch is exercised once a release, by a package, on a
//good day. Here both branches are asked on one machine with no build.

const stance = require('./stance');

test('a package is closed and a development build is not', () => {
    assert.equal(stance.decided(true, {}), false, 'a packaged build was born open');
    assert.equal(stance.decided(false, {}), true, 'development cannot be driven');
});

//ABSENT MEANS THE DEFAULT, which is what every app that has never heard of this
//key gets: a working dev loop and a shut package.
test('a manifest that says nothing gets the default both ways', () => {
    assert.equal(stance.decided(true, null), false);
    assert.equal(stance.decided(true, { app: {} }), false);
    assert.equal(stance.decided(false, { app: { serve: true } }), true);
});

//BOTH OVERRIDES, and the second is the one that matters day to day: it is how
//the closed stance is developed against in three seconds instead of the three
//minutes a `dist` costs.
test('the manifest can force it either way', () => {
    assert.equal(stance.decided(true, { app: { open: true } }), true, 'a debug package stayed shut');
    assert.equal(stance.decided(false, { app: { open: false } }), false,
        'a dev build could not be closed, so the closed stance can only be reached by packaging');
});

//A STRING IS TRUTHY, which is exactly how `"open": "false"` would ship a build
//the manifest plainly meant to close. Refused, naming the key.
test('a manifest that says something else is refused rather than guessed at', () => {
    assert.throws(() => stance.decided(true, { app: { open: 'false' } }), /"app": \{ "open" \}/);
    assert.throws(() => stance.decided(true, { app: { open: 1 } }), /true or false/);
});

//---- what a closed build reaches ------------------------------------------

test('an open build reaches everything, listed or not', () => {
    const it = stance.of(true, { commands: ['health'] });

    assert.equal(it.closed, false);
    assert.equal(it.reaches('commands', 'health'), null);
    assert.equal(it.reaches('commands', 'snapshot'), null, 'an open build refused something');
});

test('a closed build reaches what is listed and nothing else', () => {
    const it = stance.of(false, { commands: ['health', 'may'], tools: ['screenshot'] });

    assert.equal(it.closed, true);
    assert.equal(it.reaches('commands', 'health'), null);
    assert.equal(it.reaches('tools', 'screenshot'), null);

    const no = it.reaches('commands', 'snapshot');
    assert.ok(no, 'a closed build handed out a command nobody listed');
    assert.ok(no.includes('config.may.open.commands'), 'the refusal does not say where to look: ' + no);
});

//THE LISTS DO NOT BLEED. A command called `screenshot` is not reachable because
//an MCP tool of that name is -- they are different surfaces, and one list
//standing in for the other is how a name gets reachable in a place nobody meant.
test('one kind of name does not open another', () => {
    const it = stance.of(false, { tools: ['screenshot'] });

    assert.equal(it.reaches('tools', 'screenshot'), null);
    assert.ok(it.reaches('commands', 'screenshot'), 'a tool name opened a command');
});

//NOTHING LISTED IS AN ORDINARY STATE and it refuses everything, which is what a
//default-deny with an empty list has to mean.
test('a closed build with no list reaches nothing', () => {
    const it = stance.of(false, null);

    assert.equal(it.unreadable, null, 'an absent list was called unreadable');
    assert.ok(it.reaches('commands', 'health'));
});

//---- and the config being wrong -------------------------------------------
//
//FAIL SHUT, AND SAY WHICH KIND OF SHUT. Every list is empty when the config
//cannot be read, so it would refuse anyway -- but it would refuse saying the
//name is missing from a list somebody can see is right there.
test('a config that cannot be read refuses everything and says so', () => {
    for (const bad of [['health'], 'health', 42]) {
        const it = stance.of(false, bad);
        assert.ok(it.unreadable, JSON.stringify(bad) + ' was read as a list');
        assert.ok(it.reaches('commands', 'health').includes('could not be read'));
    }
});

test('a list that is not a list of names is refused', () => {
    assert.ok(stance.of(false, { commands: 'health' }).unreadable);
    assert.ok(stance.of(false, { commands: [1, 2] }).unreadable);
    assert.ok(stance.of(false, { commands: ['health', ''] }).unreadable);
});

//A TYPO IS A LIST THAT DOES NOTHING. `command:` for `commands:` would leave
//every command shut while the config plainly says otherwise, which reads as a
//broken app rather than as a misspelling.
test('a kind nobody understands is a typo, and is said out loud', () => {
    const it = stance.of(false, { command: ['health'] });

    assert.ok(it.unreadable, 'a misspelled kind was accepted in silence');
    assert.ok(it.unreadable.includes('command'), it.unreadable);
});

test('a kind nobody understands cannot be asked about either', () => {
    assert.ok(stance.of(false, { commands: ['x'] }).reaches('buttons', 'x'));
});

//AN OPEN BUILD DOES NOT CARE THAT THE LIST IS WRONG, because it reaches
//everything anyway -- and refusing to boot over a config that is not being
//consulted would be the stance breaking the dev loop it exists to protect.
test('an open build is not stopped by a list it never reads', () => {
    const it = stance.of(true, { command: ['health'] });

    assert.ok(it.unreadable, 'the trouble should still be visible');
    assert.equal(it.reaches('commands', 'health'), null, 'an open build refused something');
});

//---- what is listed but not there -----------------------------------------
//
//THE DRIFT A LIST OF NAMES INVITES. A command gets renamed and the entry stays,
//saying something is reachable that does not exist -- so the screen that lists
//what a tool can reach can mark it rather than lying quietly.
test('a listed name that nothing registers is reported', () => {
    const it = stance.of(false, { commands: ['health', 'gone'] });

    assert.deepStrictEqual(it.stale('commands', ['health', 'may']), ['gone']);
    assert.deepStrictEqual(it.stale('commands', ['health', 'gone']), []);
});

//AN OPEN BUILD HAS NO DRIFT TO REPORT, because the list is not what decides
//anything there. Reporting it would put a warning on every developer's screen
//about a list that is not in use.
test('an open build reports nothing stale', () => {
    assert.deepStrictEqual(stance.of(true, { commands: ['gone'] }).stale('commands', []), []);
});

//---- and the one override that exists so this can be tested at all --------
//
//WITHOUT IT THE CLOSED BRANCH RUNS ABOUT ONCE A RELEASE, because reaching it
//means `npm run dist` and `npm run drive -- --package` -- four minutes. With it,
//`npm run drive -- --closed` is twenty seconds. That is the difference between a
//branch that is exercised and one that rots, which is this whole feature's
//named risk.

test('the environment can close a development build and open a package', () => {
    assert.equal(stance.decided(false, {}, { APP_OPEN: '0' }), false, 'a dev build would not close');
    assert.equal(stance.decided(true, {}, { APP_OPEN: '1' }), true, 'a package would not open');
    assert.equal(stance.decided(false, {}, { APP_OPEN: 'false' }), false);
    assert.equal(stance.decided(true, {}, { APP_OPEN: 'true' }), true);
});

//IT BEATS THE MANIFEST, which is what makes it usable: closing a build for one
//run must not mean editing a tracked file and remembering to put it back.
test('the environment beats the manifest, both ways round', () => {
    assert.equal(stance.decided(false, { app: { open: true } }, { APP_OPEN: '0' }), false);
    assert.equal(stance.decided(true, { app: { open: false } }, { APP_OPEN: '1' }), true);
});

//AND SAYING NOTHING IS NOT SAYING NO. An unset variable reads as undefined and
//an empty one as '' -- treating either as false would close every build on every
//machine that has never heard of this, which is the default nobody asked for.
test('an environment that says nothing leaves the manifest to decide', () => {
    for (const env of [{}, { APP_OPEN: undefined }, { APP_OPEN: '' }, null]) {
        assert.equal(stance.decided(false, {}, env), true, JSON.stringify(env) + ' closed a dev build');
        assert.equal(stance.decided(true, {}, env), false, JSON.stringify(env) + ' opened a package');
    }
});

//EVERY ENVIRONMENT VARIABLE IS A STRING, so `APP_OPEN=false` is truthy and a
//loose reading would OPEN a build somebody plainly meant to close. Refused,
//naming the variable, exactly as a non-boolean manifest key is.
test('an environment value nobody understands is refused rather than guessed at', () => {
    assert.throws(() => stance.decided(true, {}, { APP_OPEN: 'yes' }), /APP_OPEN/);
    assert.throws(() => stance.decided(true, {}, { APP_OPEN: 'no' }), /1, 0, true or false/);
    assert.throws(() => stance.decided(true, {}, { APP_OPEN: 'closed' }), /APP_OPEN/);
});
