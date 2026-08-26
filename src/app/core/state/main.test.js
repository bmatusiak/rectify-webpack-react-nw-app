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

    //THE SECOND DRAWER: the one that is about whatever the app has open.
    //
    //EVERY TEST HERE PUTS THE APP BACK. `follow` is one slot on the real
    //service, so a suite that claims it and walks away leaves the running app
    //believing a namespace is open that this test invented -- and the next
    //thing to write something would put it there.
    describe('the drawer for whatever is open', function () {

        function following(name, fn) {
            var undo = state.follow(function () { return name; });

            try { return fn(); } finally {
                //THE SWEEP MUST NOT THROW. One of these tests follows a
                //namespace called `../escape` on purpose, and asking that for
                //its directory is the refusal being tested -- thrown from a
                //`finally`, it replaces the test's own result with a confusing
                //one about cleaning up.
                var dir = null;
                try { dir = state.here.where; } catch (e) { /* not a name, so no directory */ }

                swept(dir);
                undo();
            }
        }

        //THE DIRECTORY GOES TOO, NOT ONLY THE DOCUMENT.
        //
        //`forget()` unlinks a file and leaves the folder it was in, which is
        //right -- a namespace with nothing in it is still a namespace. It is
        //wrong for a suite: these run against the app's REAL data directory, and
        //forty empty `probe-<pid>` folders had already collected in it before
        //anybody looked. A run that leaves litter in the thing it is testing is
        //a run that changed the app somebody is using.
        function swept(dir) {
            if (!dir || dir.indexOf('probe-') < 0) return;//never anything real
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* gone already */ }
        }

        //NOTHING IS OPEN UNLESS SOMETHING SAYS SO. The scaffold itself never
        //calls `follow`, so this is the state a plugin finds by default -- and
        //it has to be a refusal rather than the app's own drawer.
        it('refuses when nothing is following, rather than falling through', function () {
            assert.equal(state.here.open, false);
            assert.equal(state.here.where, null);

            var refused = null;
            try { state.here.doc('anything'); } catch (e) { refused = e.message; }

            assert.ok(refused, 'it handed back a document with nowhere to put it');
            assert.ok(refused.indexOf('state.doc') > 0,
                'the refusal does not say where the other drawer is: ' + refused);
        });

        it('keeps a namespace apart from the drawer the app owns', function () {
            var name = 'probe-' + process.pid;

            following(name, function () {
                assert.equal(state.here.open, true);
                assert.equal(state.here.name, name);

                try {
                    state.here.doc('kept').write({ which: 'namespaced' });
                    state.doc('kept').write({ which: 'the app' });

                    //THE POINT OF THE WHOLE THING. Same document name, two
                    //drawers, and neither answers the other's value.
                    assert.equal(state.here.doc('kept').read({}).which, 'namespaced');
                    assert.equal(state.doc('kept').read({}).which, 'the app');

                    assert.ok(state.here.doc('kept').path !== state.doc('kept').path);
                } finally {
                    try { state.here.doc('kept').forget(); } catch (e) { /* never written */ }
                    state.doc('kept').forget();
                }
            });
        });

        //RESOLVED ON EVERY CALL, WHICH IS WHAT MAKES A SWITCH AUTOMATIC. If the
        //answer were read once at setup, the first namespace would keep
        //answering after the app moved to the second -- and nothing would say.
        it('follows a switch with nothing subscribing and nothing reloading', function () {
            var open = 'probe-one-' + process.pid;
            var undo = state.follow(function () { return open; });

            try {
                state.here.doc('where').write({ was: 'one' });

                open = 'probe-two-' + process.pid;

                //the same expression, a different drawer, no reload
                assert.equal(state.here.doc('where').read({ was: 'nothing' }).was, 'nothing');
                assert.equal(state.here.name, open);

                state.here.doc('where').write({ was: 'two' });

                open = 'probe-one-' + process.pid;
                assert.equal(state.here.doc('where').read({}).was, 'one');
            } finally {
                try {
                    open = 'probe-one-' + process.pid; state.here.doc('where').forget();
                    open = 'probe-two-' + process.pid; state.here.doc('where').forget();
                } catch (e) { /* never written */ }

                open = 'probe-one-' + process.pid; swept(state.here.where);
                open = 'probe-two-' + process.pid; swept(state.here.where);
                undo();
            }
        });

        //A DOCUMENT HELD ACROSS A SWITCH FOLLOWS IT, which is the half of
        //"resolved on every call" that the test above cannot see: it asks for a
        //fresh document each time, so it would pass against a document that
        //remembered where it was. Its own sabotage found that -- closing the
        //namespace over the document survived, because nothing here held one.
        it('a document held across a switch follows it', function () {
            var open = 'probe-held-one-' + process.pid;
            var undo = state.follow(function () { return open; });

            //asked for ONCE, before the switch
            var held = state.here.doc('held');

            try {
                held.write({ was: 'one' });

                open = 'probe-held-two-' + process.pid;

                //the same object, and it must be about where we are NOW
                assert.equal(held.read({ was: 'nothing' }).was, 'nothing',
                    'the document is still answering about the namespace before last');

                held.write({ was: 'two' });
                assert.equal(state.here.doc('held').read({}).was, 'two');

                open = 'probe-held-one-' + process.pid;
                assert.equal(held.read({}).was, 'one');
            } finally {
                try {
                    open = 'probe-held-one-' + process.pid; held.forget();
                    open = 'probe-held-two-' + process.pid; held.forget();
                } catch (e) { /* never written */ }

                open = 'probe-held-one-' + process.pid; swept(state.here.where);
                open = 'probe-held-two-' + process.pid; swept(state.here.where);
                undo();
            }
        });

        //A NAMESPACE THAT CANNOT BE DETERMINED IS NOT AN ABSENT ONE, but both
        //mean there is nowhere to put anything -- and falling through to the
        //app's drawer would be the contamination this exists to stop.
        it('a follower that throws is nowhere, not the drawer the app owns', function () {
            var undo = state.follow(function () { throw new Error('no idea'); });

            try {
                assert.equal(state.here.open, false);

                var refused = null;
                try { state.here.doc('anything'); } catch (e) { refused = e.message; }
                assert.ok(refused, 'it answered a drawer for a namespace it could not name');
            } finally { undo(); }
        });

        //ONE SLOT, NOT A LIST. Two things claiming to know where we are is the
        //disagreement the whole idea is against.
        it('the second follower replaces the first', function () {
            var one = state.follow(function () { return 'probe-first'; });
            var two = state.follow(function () { return 'probe-second'; });

            try {
                assert.equal(state.here.name, 'probe-second');

                //and the FIRST one's undo must not take the second one off
                one();
                assert.equal(state.here.name, 'probe-second');
            } finally { two(); }

            assert.equal(state.here.open, false);
        });

        it('a namespace with a path in it is refused, and says to slug it', function () {
            following('../escape', function () {
                var refused = null;
                try { state.here.doc('anything'); } catch (e) { refused = e.message; }

                assert.ok(refused, 'a namespace called ../escape was accepted');
                assert.ok(refused.indexOf('slug') > 0, refused);
            });
        });
    });

    register();
}
module.exports = plugin;
