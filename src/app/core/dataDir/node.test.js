const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');

const places = require('./places');
const profile = require('../../../profile');

//WHERE THINGS GO, ASKED WITHOUT AN APP.
//
//NONE OF THIS COULD BE CHECKED BEFORE. It was inline in ./main.js, and the app
//under test runs with NO profile -- so the branch that puts one somewhere never
//executed, and the folder name was only ever re-derived by the test rather than
//observed. Both of its sabotages survived: main.js was broken on purpose and
//every check passed, because none of them could see the code.
//
//The in-app test even required `../../../profile` itself to get the folder name,
//which proves the two agree about a constant and nothing whatever about whether
//main.js uses it.

//---- the app's own directory ----------------------------------------------

//BOTH BRANCHES ON ONE MACHINE, which is the point of passing the platform in.
//Half of this used to be unreachable wherever it happened to be running.
test('windows keeps application data in LOCALAPPDATA', () => {
    const where = places.root('an-app', 'win32', { LOCALAPPDATA: 'C:/Users/x/AppData/Local' }, 'C:/Users/x');

    assert.equal(where, path.join('C:/Users/x/AppData/Local', 'an-app'));
});

//A HOME DIRECTORY IS THE FALLBACK AND NOT THE PLAN. LOCALAPPDATA is set on every
//windows anybody runs this on; a machine without it gets somewhere writable
//rather than a crash.
test('windows with no LOCALAPPDATA still lands somewhere writable', () => {
    const where = places.root('an-app', 'win32', {}, 'C:/Users/x');

    assert.equal(where, path.join('C:/Users/x', 'an-app'));
});

test('everywhere else uses .config in the home directory', () => {
    const where = places.root('an-app', 'linux', {}, '/home/x');

    assert.equal(where, path.join('/home/x', '.config', 'an-app'));
});

//---- and which world inside it --------------------------------------------

//THE APP'S OWN DIRECTORY DOES NOT MOVE. Adding profiles relocated nothing that
//was already on disk, which is the difference between a feature and a migration.
test('no profile is the app own directory, exactly where it always was', () => {
    assert.equal(places.within('/data/an-app', null), '/data/an-app');
    assert.equal(places.within('/data/an-app', undefined), '/data/an-app');
    assert.equal(places.within('/data/an-app', ''), '/data/an-app');
});

//A PROFILE MOVES ALL OF IT, which is the whole feature -- state, secrets and
//whatever anything else keeps sit under this.
test('a profile is a world of its own inside the app directory', () => {
    const where = places.within('/data/an-app', 'test');

    assert.equal(where, path.join('/data/an-app', profile.FOLDER, 'test'));

    //AND IT IS REALLY UNDER THE APP'S DIRECTORY. A profile that landed beside it
    //rather than inside it would leave the real data one `..` away.
    //
    //COMPARED AGAINST A JOINED PATH, not a slash literal: `path.join` answers
    //with backslashes on windows, so a prefix written with forward slashes
    //matches nothing there and the test fails on the platform it is running on.
    assert.ok(where.indexOf(path.join('/data/an-app')) === 0, where);
});

//THE LAYOUT IS NAMED ONCE, in src/profile.js, so the boot that validates a
//profile name and the code that builds the path cannot come to differ.
//
//THIS ASKS THE CODE, NOT THE CONSTANT. Comparing profile.FOLDER to itself is
//what the in-app test was doing, and it is what let the folder name be written
//out here with nothing noticing.
test('the profiles folder is the one src/profile.js names', () => {
    assert.equal(places.PROFILES, profile.FOLDER);
    assert.ok(places.within('/root', 'x').indexOf(path.join('/root', profile.FOLDER)) === 0);

    //DOT-PREFIXED so it cannot collide with a drawer an app asks for by name --
    //`dataDir.at('profiles')` is a perfectly reasonable thing to want.
    assert.equal(profile.FOLDER[0], '.', profile.FOLDER + ' could collide with a drawer');
});

//---- and what worlds there are --------------------------------------------

//NONE HAVING EVER BEEN USED IS NOT AN ERROR. A profile is created by being asked
//for, so the folder does not exist until one has been -- and a throw here would
//take out whatever screen was listing them.
//
//THE IN-APP TEST CANNOT REACH THIS. It asks the real data directory, where the
//folder happens to exist because a profile was used once months ago -- so the
//catch never ran and its sabotage survived.
test('a directory with no profiles in it is an empty list, not a throw', () => {
    const nowhere = path.join(os.tmpdir(), 'probe-no-such-app-' + process.pid);

    assert.deepEqual(places.namesIn(nowhere), []);
});

test('a file where the profiles folder should be is also an empty list', () => {
    const fs = require('node:fs');
    const root = path.join(os.tmpdir(), 'probe-dataDir-' + process.pid);

    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, profile.FOLDER), 'not a directory');

    try {
        assert.deepEqual(places.namesIn(root), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('only directories are profiles, and they come back sorted', () => {
    const fs = require('node:fs');
    const root = path.join(os.tmpdir(), 'probe-dataDir-list-' + process.pid);
    const inside = path.join(root, profile.FOLDER);

    fs.mkdirSync(path.join(inside, 'zebra'), { recursive: true });
    fs.mkdirSync(path.join(inside, 'apple'), { recursive: true });
    fs.writeFileSync(path.join(inside, 'notes.txt'), 'not a profile');

    try {
        assert.deepEqual(places.namesIn(root), ['apple', 'zebra']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
