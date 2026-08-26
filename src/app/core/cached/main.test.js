var fs = require('node:fs');
var path = require('node:path');

//THE DRAWERS, IN THE APP THAT OWNS THEM.
//
//./node.test.js has the three doors and every rule about keys. What needs the
//real app is the half this file adds: that a content-keyed drawer reaches disk,
//under the app's own directory, and that nothing else does.
//
//EVERY DRAWER HERE IS NAMED `probe-...` AND IS REMOVED AFTERWARDS. These write
//into the data directory of an app somebody is using.

plugin.consumes = ['selftest', 'cached', 'dataDir'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { cached, dataDir } = imports;

    var made = [];

    var names = [];

    function probe(kind, label) {
        var name = 'probe-' + label + '-' + process.pid;
        var drawer = cached[kind](name);

        names.push(name);
        made.push(drawer);

        return drawer;
    }

    function lastName() { return names[names.length - 1]; }

    //CLEARED THROUGH THE PLUGIN'S OWN DOOR, not by unlinking behind its back.
    //
    //The write is deferred to the end of the tick, so a test that unlinked the
    //file directly raced the write that was still coming -- tidy removed it, the
    //timer put it back, and every run left its probe drawers in the real cache
    //folder. `clear()` schedules the removal through the same path, so it cannot
    //be overtaken by the write it is undoing.
    function tidy() {
        made.forEach(function (drawer) { drawer.clear(); });
        made.length = 0;
    }

    //THE WRITE IS DEFERRED TO THE END OF THE TICK -- a drawer filled in a loop
    //would otherwise write its whole file once per answer. So a test that looks
    //at disk has to let that happen, and waiting on the file is the only honest
    //way: a fixed sleep is right until the machine is busy.
    function written(name, seconds) {
        var file = path.join(cached.where, name + '.json');
        var deadline = Date.now() + (seconds || 5) * 1000;

        return new Promise(function (resolve) {
            (function look() {
                if (fs.existsSync(file)) return resolve(file);
                if (Date.now() > deadline) return resolve(null);
                setTimeout(look, 25);
            }());
        });
    }

    describe('answers already worked out', function () {

        it('keeps its drawers under the data directory', function () {
            assert.ok(cached.where.indexOf(dataDir.path) === 0,
                cached.where + ' is not under ' + dataDir.path);

            assert.equal(cached.persists, true, 'this half is not writing anything down');
        });

        //THE ONE KIND WORTH WRITING DOWN, and it really is written: `byContent`
        //is true for ever, so a restart should not have to work it out again.
        it('writes a content-keyed drawer to disk', async function () {
            var one = probe('byContent', 'content');
            var name = lastName();

            try {
                await one.get('a-sha', function () { return { worked: 'out' }; });

                var file = await written(name);
                assert.ok(file, 'nothing was written for ' + name);

                var back = JSON.parse(fs.readFileSync(file, 'utf8'));
                assert.equal(back[0][0], 'a-sha');
                assert.equal(back[0][1].worked, 'out');
            } finally { tidy(); }
        });

        //THE RULE THAT MATTERS MOST. What a stamp-keyed drawer holds is derived
        //from a file, and that file may be a sealed credential -- so a persisted
        //copy of an unsealed secret is a worse bug than every call it saves.
        it('never writes a stamp-keyed or clock-keyed drawer', async function () {
            var stamped = probe('byStamp', 'stamped');
            var stampedName = lastName();

            var fresh = probe('whileFresh', 'fresh');
            var freshName = lastName();

            try {
                await stamped.get(__filename, function () { return 'derived from a file'; });
                await fresh.get('k', function () { return 'for a moment'; });

                //give the deferred write the same chance the one above had
                await written(stampedName, 1);

                assert.ok(!fs.existsSync(path.join(cached.where, stampedName + '.json')),
                    'a stamp-keyed drawer reached disk');
                assert.ok(!fs.existsSync(path.join(cached.where, freshName + '.json')),
                    'a clock-keyed drawer reached disk');
            } finally { tidy(); }
        });

        //A NAME BECOMES A FILE, so it is refused rather than sanitised -- the
        //same rule and the same reason as ../state's document names.
        it('refuses a drawer name that could escape the folder', function () {
            ['../escape', 'a/b', '', '.hidden', 'with space', null].forEach(function (bad) {
                var refused = null;
                try { cached.byContent(bad).get('k', function () { return 1; }); }
                catch (e) { refused = e; }

                assert.ok(refused, JSON.stringify(bad) + ' was accepted as a drawer name');
            });
        });

        //THE WRITE IS COALESCED TO THE END OF THE TICK, AND THE LATEST VALUE HAS
        //TO WIN.
        //
        //The first version captured the pairs from the call that scheduled the
        //timer and ignored every one after it -- so filling a drawer and
        //clearing it in the same tick wrote the fill and dropped the clear,
        //leaving a file on disk for a drawer with nothing in it. Found because
        //every run of this suite left its probes in the real cache folder.
        it('a fill and a clear in one tick leave nothing behind', async function () {
            var one = probe('byContent', 'coalesced');
            var name = lastName();

            await one.get('a-sha', function () { return 'worked out'; });
            one.clear();

            //the same wait the write itself gets, then it must NOT be there
            await new Promise(function (r) { setTimeout(r, 200); });

            assert.ok(!fs.existsSync(path.join(cached.where, name + '.json')),
                'the clear was dropped and the fill was written');

            made.length = 0;//already cleared, and clearing again would rewrite nothing
        });

        //AN EMPTY DRAWER IS NO FILE, NOT AN EMPTY FILE -- something a reader has
        //to open to discover is nothing.
        it('clearing a written drawer removes the file', async function () {
            var one = probe('byContent', 'removed');
            var name = lastName();

            await one.get('a-sha', function () { return 'worked out'; });
            assert.ok(await written(name), 'it never wrote one to remove');

            one.clear();
            await new Promise(function (r) { setTimeout(r, 200); });

            assert.ok(!fs.existsSync(path.join(cached.where, name + '.json')),
                'clearing left an empty file behind');

            made.length = 0;
        });

        //A DRAWER SURVIVES THE NODE HALF RELOADING, which is the reason these
        //live in main at all -- ./server.test.js makes the same claim from the
        //other side, where there is a host to compare against.
        it('keeps what it worked out for the whole life of the app', async function () {
            var one = probe('byContent', 'warm');
            var ran = 0;

            try {
                await one.get('a-sha', function () { ran++; return 'worked out'; });
                await one.get('a-sha', function () { ran++; return 'worked out'; });

                assert.equal(ran, 1, 'it worked the same answer out ' + ran + ' times');
            } finally { tidy(); }
        });
    });

    register();
}
module.exports = plugin;
