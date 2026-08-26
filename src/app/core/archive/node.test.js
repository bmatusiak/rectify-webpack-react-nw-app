const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const filing = require('./filing');
const tar = require('./tar');

//WHAT MAY BECOME A FILE, AND WHAT IS INSIDE AN ARCHIVE -- both asked without an
//app, because both are decisions about bytes and text.
//
//THE TAR TESTS BUILD REAL ARCHIVES WITH THE REAL tar, which is the only way this
//is worth anything: a reader tested against a writer of my own would agree with
//itself about a format neither of them had read correctly. Windows has shipped
//bsdtar as `tar.exe` since Windows 10, and every other platform has one.

//---- what may become a file ----------------------------------------------

test('an ordinary name is accepted', () => {
    ['build.zip', 'report-2.txt', 'a', 'x.tar.gz', 'A_B-c.1'].forEach((good) => {
        assert.equal(filing.nameIsOk(good), null, good + ' was refused');
    });
});

//REFUSED WITH A SENTENCE, not a boolean -- the caller has to tell whoever sent
//the bytes why, and `false` is not something anybody can act on.
test('anything with a path in it is refused, in words', () => {
    ['../escape', 'a/b', 'a\\b', '/etc/passwd', 'C:\\x', '..'].forEach((bad) => {
        const no = filing.nameIsOk(bad);

        assert.ok(no, bad + ' was accepted');
        assert.ok(no.indexOf('no directories') > 0, 'the refusal does not say why: ' + no);
    });
});

test('nothing, and something enormous, are refused too', () => {
    assert.ok(filing.nameIsOk(''));
    assert.ok(filing.nameIsOk(null));
    assert.ok(filing.nameIsOk('-starts-with-a-dash'));

    const long = filing.nameIsOk('x'.repeat(200));
    assert.ok(long.indexOf('120') > 0, 'the refusal does not say the limit: ' + long);
});

//A LABEL IS SQUEEZED RATHER THAN REFUSED, because it never becomes a file name
test('a label is made harmless instead of being refused', () => {
    assert.equal(filing.safe('../etc/passwd'), '.._etc_passwd');
    assert.equal(filing.safe(''), 'unknown');
    assert.equal(filing.safe(null), 'unknown');
});

//RENDERING A BINARY AS TEXT produces a screen of replacement characters, which
//looks like corruption rather than like "this is not text".
test('binary is told from text by looking, not by the name', () => {
    assert.equal(filing.looksText(Buffer.from('hello, world')), true);
    assert.equal(filing.looksText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d])), false);
    assert.equal(filing.looksText(Buffer.alloc(0)), true);
});

//---- what is inside an archive -------------------------------------------

const TARS = ['C:\\Windows\\System32\\tar.exe', 'tar'];

function madeWith(args, where) {
    for (const exe of TARS) {
        try {
            const out = cp.spawnSync(exe, args, { cwd: where, encoding: 'utf8', timeout: 20000 });
            if (out.status === 0) return true;
        } catch (e) { /* try the next one */ }
    }
    return false;
}

const LONG = ['a-directory-with-a-long-name', 'and-another-one-just-as-long',
    'and-a-third-to-be-sure', 'deeper-still'].join('/');

function scratch() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-probe-'));

    fs.writeFileSync(path.join(dir, 'one.txt'), 'hello');
    //TWENTY BYTES, WHICH IS NOT THE SAME NUMBER IN OCTAL AND IN DECIMAL.
    //Anything under eight reads identically either way -- `world!!` is seven, so
    //this fixture agreed with a reader that had the base wrong, and that
    //sabotage survived twice before the file was made big enough to tell.
    fs.writeFileSync(path.join(dir, 'two.txt'), 'world, and then some');
    fs.mkdirSync(path.join(dir, 'deep', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deep', 'nested', 'three.txt'), 'deep');

    //LONGER THAN THE 100-CHARACTER NAME FIELD, which is the only thing that
    //makes tar use the `prefix` field at all. Without a path this long, dropping
    //the prefix changes nothing and the sabotage for it survives -- which is
    //exactly what happened.
    fs.mkdirSync(path.join(dir, LONG), { recursive: true });
    fs.writeFileSync(path.join(dir, LONG, 'buried.txt'), 'far down');

    return dir;
}

test('a real tar is read: names, sizes and directories', (t) => {
    const dir = scratch();

    try {
        if (!madeWith(['-cf', 'probe.tar', 'one.txt', 'two.txt', 'deep', LONG.split('/')[0]], dir)) {
            return t.skip('no tar on this machine to make one with');
        }

        const bytes = fs.readFileSync(path.join(dir, 'probe.tar'));

        assert.equal(tar.looksTar(bytes), true, 'a real tar was not recognised');
        assert.equal(tar.looksGzipped(bytes), false);

        const inside = tar.entries(bytes);
        assert.equal(inside.unreadable, null, inside.unreadable);

        const one = inside.files.filter((f) => f.name === 'one.txt')[0];
        assert.ok(one, 'one.txt is missing from ' + inside.files.map((f) => f.name).join(', '));
        assert.equal(one.bytes, 5, 'the size is octal and was read as ' + one.bytes);
        assert.equal(one.directory, false);

        //THE PREFIX FIELD IS THE FIRST PART OF A LONG PATH, and joining it back
        //on is the difference between `three.txt` and the path it really has.
        assert.ok(inside.files.filter((f) => f.name === 'deep/nested/three.txt')[0],
            'a nested path came back as ' + inside.files.map((f) => f.name).join(', '));

        assert.ok(inside.files.filter((f) => f.directory)[0], 'no directory entries at all');

        //A SIZE THAT IS NOT THE SAME NUMBER IN OCTAL AND IN DECIMAL. `hello` is
        //five bytes, and `000000000005` reads as five either way -- so the whole
        //test passed against a reader that treated the field as decimal. Eight
        //is the first size where the two differ; see `scratch` above.
        const two = inside.files.filter((f) => f.name === 'two.txt')[0];

        assert.ok(two, 'two.txt is missing');
        assert.equal(two.bytes, fs.statSync(path.join(dir, 'two.txt')).size,
            'the size field was not read as octal');

        //AND THE PREFIX FIELD, which only appears for a path too long for the
        //100-character name field. A short nested path fits in `name`, so
        //dropping the prefix looked correct until there was one of these.
        const buried = inside.files.filter((f) => /buried\.txt$/.test(f.name))[0];

        assert.ok(buried, 'nothing matching buried.txt in ' + inside.files.map((f) => f.name).join(', '));
        assert.ok(buried.name.length > 100,
            'the long path came back as ' + buried.name + ', so the prefix was dropped');
        assert.ok(buried.name.indexOf('a-directory-with-a-long-name') === 0, buried.name);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

//A HALF-ANSWER PRESENTED AS AN ANSWER is the failure worth avoiding here,
//because a partial listing looks exactly like a small archive. Both of these
//store the real name in a preceding entry, so a reader that ignored them would
//list `././@PaxHeader` and a truncated name and call that the contents.
test('a tar this cannot read is refused by name, not half read', (t) => {
    const dir = scratch();

    try {
        if (!madeWith(['--format=pax', '-cf', 'pax.tar', 'one.txt'], dir)) {
            return t.skip('no tar here that makes pax archives');
        }

        const inside = tar.entries(fs.readFileSync(path.join(dir, 'pax.tar')));

        assert.ok(inside.unreadable, 'a pax archive was read as though it were ustar');
        assert.ok(inside.unreadable.indexOf('PAX') >= 0, inside.unreadable);
        assert.equal(inside.files.length, 0, 'it handed back a partial listing as well');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a gzipped tar says so rather than pretending it is not a tar', (t) => {
    const dir = scratch();

    try {
        if (!madeWith(['-czf', 'probe.tgz', 'one.txt'], dir)) {
            return t.skip('no tar on this machine to make one with');
        }

        const bytes = fs.readFileSync(path.join(dir, 'probe.tgz'));

        assert.equal(tar.looksGzipped(bytes), true, 'the two magic bytes were not seen');
        assert.equal(tar.looksTar(bytes), false, 'a gzipped file was taken for a tar');

        const inside = tar.entries(bytes);
        assert.ok(inside.unreadable.indexOf('gzipped') >= 0, inside.unreadable);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

//---- and the things that are not archives at all -------------------------

test('something that is not a tar is refused rather than looped over', () => {
    //A SIZE FIELD THAT WILL NOT PARSE would advance the offset by NaN and turn a
    //bad file into an endless loop, so it is read as zero -- but this should not
    //get that far anyway.
    [Buffer.from('hello, world'), Buffer.alloc(0), Buffer.alloc(512)].forEach((odd) => {
        const inside = tar.entries(odd);
        assert.equal(inside.files.length, 0);
        assert.ok(inside.unreadable, 'it claimed to read ' + odd.length + ' bytes of nothing');
    });
});

//A TAR IS A WHOLE NUMBER OF 512-BYTE BLOCKS, which is the cheap half of the
//check -- and something that has the magic in the right place by accident but is
//the wrong length is not one.
test('a file with the magic in the right place but a ragged length is not a tar', () => {
    const fake = Buffer.alloc(700);
    fake.write('ustar', 257, 'latin1');

    assert.equal(tar.looksTar(fake), false);
});
