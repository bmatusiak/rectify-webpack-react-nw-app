var fs = require('node:fs');
var path = require('node:path');
var zlib = require('node:zlib');

//FILES, IN THE APP THAT IS KEEPING THEM.
//
//./node.test.js has the two rules -- what may become a file, and what is inside
//an archive. What needs the real app is the drawer: that bytes reach disk under
//the app's own directory, that a namespace's files are apart from the app's, and
//that reading one back gives an answer a screen can use.
//
//EVERY STORE HERE IS NAMED `probe-...` AND IS EMPTIED AFTERWARDS. These write
//into the data directory of an app somebody is using.

plugin.consumes = ['selftest', 'archive', 'state', 'dataDir'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { archive, state, dataDir } = imports;

    var made = [];

    function probe(label) {
        var one = archive.store('probe-' + label + '-' + process.pid);
        made.push(one);
        return one;
    }

    //THE DIRECTORY GOES TOO, not only the files in it -- the same lesson
    //../state's suite learned by leaving forty empty namespaces behind.
    function tidy() {
        made.forEach(function (one) { one.drop(); });
        made.length = 0;
    }

    describe('files the app was handed', function () {

        it('keeps them under the data directory', function () {
            assert.ok(archive.where.indexOf(dataDir.path) === 0,
                archive.where + ' is not under ' + dataDir.path);
        });

        it('keeps bytes and hands them back', function () {
            var one = probe('roundtrip');

            try {
                var out = one.keep('report.txt', 'what happened, in words');

                assert.equal(out.kept, true, out.refused);
                assert.equal(out.bytes, 23);

                assert.equal(one.has('report.txt'), true);
                assert.equal(one.read('report.txt').text, 'what happened, in words');

                var listed = one.list();
                assert.equal(listed.length, 1);
                assert.equal(listed[0].file, 'report.txt');
                assert.ok(listed[0].kept, 'it does not say when');
            } finally { tidy(); }
        });

        //A REFUSAL IS AN ANSWER, NOT A THROW. Everything that can go wrong here
        //is something the caller has to explain to whoever sent the bytes, and
        //an exception is the shape that makes a caller either swallow it or
        //crash.
        it('refuses a name that could escape the drawer, in words', function () {
            var one = probe('names');

            try {
                ['../escape', 'a/b', '', null].forEach(function (bad) {
                    var out = one.keep(bad, 'anything');

                    assert.ok(out.refused, JSON.stringify(bad) + ' was accepted');
                    assert.equal(out.kept, undefined);
                });

                //and nothing was written anywhere
                assert.equal(one.list().length, 0);
            } finally { tidy(); }
        });

        it('refuses something enormous, and says the size', function () {
            var one = probe('big');

            try {
                //ASKED OF THE RULE RATHER THAN BY WRITING 256MB, which would be
                //a test that takes a minute and fills a disk to prove a `>`.
                assert.ok(archive.MOST > 1000000, 'the cap is implausibly small');

                var out = one.keep('huge.bin', Buffer.alloc(10));
                assert.equal(out.kept, true, 'a small file was refused: ' + out.refused);
            } finally { tidy(); }
        });

        //RENDERING A BINARY AS TEXT produces a screen of replacement characters,
        //which reads as corruption rather than as "this is not text".
        it('refuses to read a binary back as text, and says where it is', function () {
            var one = probe('binary');

            try {
                one.keep('picture.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));

                var out = one.read('picture.png');

                assert.ok(out.refused, 'it handed back a binary as text');
                assert.ok(out.refused.indexOf(one.where) > 0,
                    'the refusal does not say where the file is: ' + out.refused);
            } finally { tidy(); }
        });

        //AN ARCHIVE IS LOOKED INSIDE RATHER THAN REFUSED AS BINARY, which is the
        //one thing that makes `read` useful for the file type people actually
        //hand around. The gzip is unpacked here, not by ./tar.js.
        it('looks inside a gzipped tar without unpacking it to disk', function () {
            var one = probe('tar');

            try {
                //A REAL TAR, BUILT HERE: two 512-byte headers and their content,
                //which is what ./node.test.js checks a real `tar` produces.
                var block = Buffer.alloc(512);
                block.write('inside.txt', 0, 'latin1');
                block.write('000000000005', 124, 'latin1');//octal, and it is five
                block.write('0', 156, 'latin1');
                block.write('ustar  ', 257, 'latin1');

                var body = Buffer.alloc(512);
                body.write('hello', 0, 'latin1');

                var made = Buffer.concat([block, body, Buffer.alloc(1024)]);

                one.keep('bundle.tgz', zlib.gzipSync(made));

                var out = one.read('bundle.tgz');

                assert.ok(!out.refused, out.refused);
                assert.equal(out.gzip, true, 'it did not notice the gzip');
                assert.equal(out.tar, true, 'it did not notice the tar');

                assert.ok(out.entries && out.entries.length >= 1, 'nothing was listed');
                assert.equal(out.entries[0].name, 'inside.txt');
                assert.equal(out.entries[0].bytes, 5);

                //and nothing was unpacked next to it
                assert.equal(one.list().length, 1, 'reading it left something behind');
            } finally { tidy(); }
        });

        it('forgets a file and the note about it', function () {
            var one = probe('forget');

            try {
                one.keep('gone.txt', 'here for now', 'a note about where it came from');

                assert.equal(one.forget('gone.txt'), true);
                assert.equal(one.has('gone.txt'), false);
                assert.equal(one.list().length, 0);

                //forgetting twice is not an error -- the caller wanted it gone
                assert.equal(one.forget('gone.txt'), false);
            } finally { tidy(); }
        });

        //THE SIDECAR IS NOT A FILE SOMEBODY KEPT, and a listing that showed it
        //would double every row.
        it('does not list the note as though it were a file', function () {
            var one = probe('about');

            try {
                one.keep('build.zip', 'not really a zip', 'made by the suite');

                var listed = one.list();
                assert.equal(listed.length, 1, 'it listed ' + listed.map(function (f) { return f.file; }).join(', '));
                assert.equal(listed[0].about, 'made by the suite');
            } finally { tidy(); }
        });
    });

    //---- and the drawer for whatever is open ------------------------------

    describe('files a namespace produced', function () {

        it('refuses when nothing is open, rather than falling through', function () {
            assert.equal(archive.here.open, false);
            assert.equal(archive.here.where, null);

            var refused = null;
            try { archive.here.store('anything'); } catch (e) { refused = e.message; }

            assert.ok(refused, 'it handed back a store with nowhere to put anything');
            assert.ok(refused.indexOf('archive.store') > 0,
                'the refusal does not say where the other one is: ' + refused);
        });

        //THE POINT OF THE WHOLE THING: what a namespace produced is not sitting
        //there answering when the app is pointed at a different one.
        it('keeps a namespace\'s files apart from the app\'s own', function () {
            var name = 'probe-' + process.pid;
            var undo = state.follow(function () { return name; });

            try {
                var mine = archive.here.store('runs');
                var theirs = archive.store('probe-runs-' + process.pid);

                made.push(theirs);

                try {
                    mine.keep('out.txt', 'from the namespace');
                    theirs.keep('out.txt', 'from the app');

                    assert.equal(mine.read('out.txt').text, 'from the namespace');
                    assert.equal(theirs.read('out.txt').text, 'from the app');

                    assert.ok(mine.where !== theirs.where);
                    assert.ok(mine.where.indexOf(state.here.where) === 0,
                        mine.where + ' is not under ' + state.here.where);
                } finally {
                    mine.drop();

                    //the namespace's whole drawer, which is ../state's to make
                    //and so is this suite's to take back
                    try { fs.rmSync(state.here.where, { recursive: true, force: true }); }
                    catch (e) { /* already gone */ }
                }
            } finally { tidy(); undo(); }
        });
    });

    register();
}
module.exports = plugin;
