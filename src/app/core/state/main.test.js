var fs = require('node:fs');
var path = require('node:path');

//THE APP'S OWN DRAWER, IN THE APP THAT OWNS IT.
//
//Every document here is named `probe-...`, and every test cleans up after
//itself: this writes into the data directory of an app somebody is using, and a
//suite that left files behind would be indistinguishable from the app doing it.

plugin.consumes = ['selftest', 'state', 'dataDir'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var state = imports.state;

    var made = [];

    function probe(label) {
        var name = 'probe-' + label + '-' + process.pid;
        made.push(name);
        return state.doc(name);
    }

    function tidy() {
        made.forEach(function (name) {
            try { state.doc(name).forget(); } catch (e) { /* never written */ }
        });
        made.length = 0;
    }

    describe('what the app keeps between restarts', function () {

        it('is under the data directory, not somewhere of its own', function () {
            assert.ok(state.where.indexOf(imports.dataDir.path) === 0,
                state.where + ' is not under ' + imports.dataDir.path);
        });

        //A MISSING FILE MEANS "NOTHING TO GO ON", which is what every call site
        //treats the fallback as -- so it must be the answer rather than a throw.
        it('answers the fallback when there is nothing kept', function () {
            var doc = probe('missing');

            try {
                var out = doc.read({ never: 'written' });
                assert.equal(out.never, 'written');
            } finally { tidy(); }
        });

        it('writes something and reads it back', function () {
            var doc = probe('roundtrip');

            try {
                doc.write({ port: 8080, on: true, name: 'a value' });

                var out = doc.read(null);
                assert.ok(out, 'nothing came back');
                assert.equal(out.port, 8080);
                assert.equal(out.on, true);
                assert.equal(out.name, 'a value');
            } finally { tidy(); }
        });

        //THE FALLBACK AGAIN FOR AN UNREADABLE ONE. A half-written or corrupted
        //file is not recoverable here, and both cases mean the same thing to a
        //caller -- the difference is worth a log line, not a branch at every use.
        it('answers the fallback for a file that will not parse', function () {
            var doc = probe('corrupt');

            try {
                doc.write({ real: true });
                fs.writeFileSync(doc.path, '{ this is not json');

                assert.equal(doc.read({ fell: 'back' }).fell, 'back');
            } finally { tidy(); }
        });

        //A BYTE-ORDER MARK IS WHAT A FILE PICKS UP FROM AN EDITOR ON WINDOWS,
        //and JSON.parse refuses it -- which reads as corruption rather than as a
        //BOM, and sends somebody looking for a bug that is not there.
        it('reads a file an editor put a byte-order mark on', function () {
            var doc = probe('bom');

            try {
                doc.write({ kept: 'yes' });
                fs.writeFileSync(doc.path, '﻿' + JSON.stringify({ kept: 'yes' }));

                assert.equal(doc.read({}).kept, 'yes', 'a BOM defeated it');
            } finally { tidy(); }
        });

        //NOTHING HALF-WRITTEN IS EVER VISIBLE. A reader that opens a partial file
        //does not get an error, it gets the FALLBACK -- which every call site
        //reads as "nothing kept yet". That is a silent, total loss dressed as a
        //fresh install, and the rename is what prevents it.
        it('never leaves the real file half written', function () {
            var doc = probe('atomic');

            try {
                doc.write({ big: 'x'.repeat(50000) });

                //the file is whole and the scratch file is not left behind
                assert.equal(doc.read(null).big.length, 50000);
                assert.ok(!fs.existsSync(doc.path + '.writing'), 'the scratch file was left behind');
            } finally { tidy(); }
        });

        //AN EMPTY DOCUMENT AND NO DOCUMENT ARE DIFFERENT ANSWERS, and only one
        //of them means "this was never set up".
        it('forget makes it stop existing, rather than become empty', function () {
            var doc = probe('forgotten');

            try {
                doc.write({ here: true });
                assert.ok(fs.existsSync(doc.path));

                assert.equal(doc.forget(), true);
                assert.ok(!fs.existsSync(doc.path), 'the file is still there');

                //and reading it now is "nothing kept", not "{}"
                assert.equal(doc.read('gone'), 'gone');

                //forgetting twice is not an error -- the caller wanted it gone
                assert.equal(doc.forget(), false, 'it claimed to remove something twice');
            } finally { tidy(); }
        });

        //A NAME THAT IS NOT A NAME IS A CALLER BUG, and it should be one at the
        //call that made it. Sanitising `../../etc/passwd` into `etcpasswd` writes
        //a file somewhere surprising and says nothing.
        it('refuses a name that could escape the drawer', function () {
            ['../escape', 'a/b', '', '   ', '.hidden', 'with space', null].forEach(function (bad) {
                var refused = null;
                try { state.doc(bad); } catch (e) { refused = e; }
                assert.ok(refused, JSON.stringify(bad) + ' was accepted as a name');
            });
        });

        it('lists what is kept', function () {
            var doc = probe('listed');

            try {
                doc.write({ x: 1 });

                var names = state.names();
                assert.ok(names.indexOf(made[made.length - 1]) >= 0,
                    'it is not listed: ' + names.join(', '));
            } finally { tidy(); }
        });

        //READING A PATH MUST NOT MAKE A DIRECTORY, the same cut ../dataDir makes
        //between `at` and `ensure` -- otherwise describing a document in a log
        //line creates a folder as a side effect.
        it('asking where something would go creates nothing', function () {
            var doc = state.doc('probe-untouched-' + process.pid);

            assert.ok(doc.path.indexOf('probe-untouched') > 0);
            assert.ok(!fs.existsSync(doc.path), 'asking for the path wrote a file');
        });
    });

    register();
}
module.exports = plugin;
