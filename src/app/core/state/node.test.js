const { test } = require('node:test');
const assert = require('node:assert');

const names = require('./names');

//WHAT MAY BECOME A FILE OR A FOLDER, ASKED WITHOUT AN APP.
//
//These are the two rules that decide whether a string is allowed to become a
//path, so they are the ones worth asking in a millisecond rather than inside a
//running app -- and the interesting cases are the ones a real caller will never
//produce on purpose.

//---- a document name ------------------------------------------------------

test('an ordinary name becomes a json file', () => {
    assert.equal(names.fileName('example'), 'example.json');
    assert.equal(names.fileName('two-words'), 'two-words.json');
    assert.equal(names.fileName('  spaced  '), 'spaced.json');
});

//REFUSED, NOT SANITISED. Quietly turning `../../etc/passwd` into `etcpasswd`
//writes a file somewhere surprising and says nothing.
test('anything with a path in it is refused', () => {
    ['../escape', 'a/b', '..', 'a\\b', '/etc/passwd', 'C:\\x'].forEach((bad) => {
        assert.throws(() => names.fileName(bad), /named in letters/, bad + ' was allowed');
    });
});

test('nothing at all is refused too', () => {
    [null, undefined, '', '   ', '-leading'].forEach((bad) => {
        assert.throws(() => names.fileName(bad), /named in letters/, JSON.stringify(bad) + ' was allowed');
    });
});

//---- a namespace name -----------------------------------------------------

//WIDER THAN A DOCUMENT NAME, ON PURPOSE. A namespace is usually named after
//something a person already has -- a folder, a project, a branch -- and
//`my_project.v2` is an ordinary such name.
test('a namespace may have dots and underscores, a document may not', () => {
    assert.equal(names.folderName('my_project.v2'), 'my_project.v2');
    assert.throws(() => names.fileName('my_project.v2'), /named in letters/);
});

test('a namespace with a path in it is refused, and says what to do instead', () => {
    assert.throws(() => names.folderName('/home/me/work'), /state\.slug/);
    assert.throws(() => names.folderName('..'), /state\.slug/);
});

//---- turning anything into one --------------------------------------------

test('a path becomes a readable name', () => {
    const out = names.slug('/home/me/projects/website');
    assert.ok(out.indexOf('website') === 0, out);
    assert.equal(names.folderName(out), out, out + ' is not a name it would then accept');
});

//THE REASON THE HASH IS THERE. Two folders called `website` on different disks
//is the ordinary case, not a contrived one, and a slug of the last part alone
//would put both in one drawer -- which is the contamination the whole idea is
//against, arriving through the door meant to prevent it.
test('two different paths ending in the same word are two namespaces', () => {
    const one = names.slug('/home/me/projects/website');
    const two = names.slug('/mnt/backup/old/website');

    assert.notEqual(one, two, 'both paths slugged to ' + one);

    //and both still say `website`, because a directory nobody can identify is
    //the other way to get this wrong
    assert.ok(one.indexOf('website') === 0 && two.indexOf('website') === 0);
});

test('the same path is always the same namespace', () => {
    assert.equal(names.slug('/home/me/work'), names.slug('/home/me/work'));
    assert.equal(names.slug('C:\\Users\\me\\work'), names.slug('C:\\Users\\me\\work'));
});

test('windows and posix separators are both understood', () => {
    assert.ok(names.slug('C:\\Users\\me\\work').indexOf('work') === 0);
    assert.ok(names.slug('/home/me/work').indexOf('work') === 0);
});

//NOTHING IS NOT AN ERROR HERE, unlike the two rules above: `slug` exists to
//turn whatever an app has into something usable, so it always answers a name.
test('slug always answers something a namespace may be called', () => {
    ['', null, undefined, '///', '???', '.'].forEach((odd) => {
        const out = names.slug(odd);
        assert.equal(names.folderName(out), out, JSON.stringify(odd) + ' slugged to ' + out);
    });
});
