const { test } = require('node:test');
const assert = require('node:assert');

const profile = require('../src/profile');

//WHICH SET OF DATA A RUN WORKS ON, DECIDED BEFORE ANYTHING IS OPEN.
//
//Both main boots call this and hand the answer to the app, so a disagreement
//between them would be two halves of one launch keeping things in two places.
//It is pure, so it is answered here rather than in a running app.

const NOTHING = { app: {} };

//---- the two ways to say it, and which wins -------------------------------

test('no flag and no manifest is the app\'s own directory', () => {
    assert.equal(profile(NOTHING, []), null);
    assert.equal(profile({}, []), null);
    assert.equal(profile(null, null), null);
});

test('the manifest decides when nothing on the command line does', () => {
    assert.equal(profile({ app: { profile: 'demo' } }, []), 'demo');
});

//A MANIFEST FIELD IS HOW SOMEBODY WHO SHIPS THE APP DECIDES; a flag is how
//somebody running it decides once, without editing anything. The flag winning
//is the only ordering that makes `--profile` useful on a build that ships with
//one set.
test('the flag wins over the manifest, in both directions', () => {
    assert.equal(profile({ app: { profile: 'demo' } }, ['--profile=test']), 'test');
    assert.equal(profile({ app: { profile: 'demo' } }, ['--no-profile']), null);
});

test('the last flag wins, so two of them is a decision and not a puzzle', () => {
    assert.equal(profile(NOTHING, ['--profile=one', '--profile=two']), 'two');
    assert.equal(profile(NOTHING, ['--profile=one', '--no-profile']), null);
    assert.equal(profile(NOTHING, ['--no-profile', '--profile=one']), 'one');
});

test('flags meant for something else are left alone', () => {
    assert.equal(profile(NOTHING, ['--serve=8080', '--profiler', '--profile']), null);
});

//---- and the refusal that matters -----------------------------------------

//THIS IS THE ONE PLACE THAT MUST NOT FALL BACK. src/serve.js prints a complaint
//and serves somewhere sensible, because the cost of getting that wrong is a port
//nobody wanted. The cost here is that the run which ASKED to be kept apart
//writes into the real data instead -- so a mistyped `--profile` must stop the
//launch, not quietly become "no profile".
test('a name that is not a name stops the launch', () => {
    ['../escape', 'a/b', '..', '.', 'C:\\x', '-leading', 'has space'].forEach((bad) => {
        assert.throws(() => profile(NOTHING, ['--profile=' + bad]),
            /is not a name/, JSON.stringify(bad) + ' was accepted');
    });
});

test('the refusal says why it is a refusal rather than a fallback', () => {
    assert.throws(() => profile(NOTHING, ['--profile=../x']), (e) => {
        assert.match(e.message, /Refusing rather than falling back/);
        assert.match(e.message, /the app's own/);
        return true;
    });
});

test('a manifest can be wrong too, and is refused the same way', () => {
    assert.throws(() => profile({ app: { profile: '../x' } }, []), /is not a name/);
});

//---- the ordinary names people will actually use --------------------------

test('the names an app would really use are accepted', () => {
    ['test', 'demo', 'my_project.v2', 'client-2', 'a'].forEach((good) => {
        assert.equal(profile(NOTHING, ['--profile=' + good]), good);
    });
});

//---- where they live ------------------------------------------------------

//DOT-PREFIXED so it cannot collide with a drawer an app asks for by name.
//`dataDir.at('profiles')` is a perfectly reasonable thing for somebody to want.
test('the folder profiles sit in cannot be mistaken for a drawer', () => {
    assert.equal(profile.FOLDER[0], '.', profile.FOLDER + ' could collide with a drawer name');

    //and it must not be a name a profile could be called, or a profile named
    //after the folder would land on top of the folder
    assert.ok(!profile.NAME.test(profile.FOLDER), profile.FOLDER + ' is also a legal profile name');
});
