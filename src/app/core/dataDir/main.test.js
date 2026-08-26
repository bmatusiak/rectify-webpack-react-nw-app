var os = require('node:os');
var path = require('node:path');
var fs = require('node:fs');

//WHERE THIS APP KEEPS THINGS, ASKED OF THE RUNNING APP.
//
//The value of this plugin is that there is ONE answer, so what is worth pinning
//is that the answer is the same one every other derivation of it would reach --
//and that it says which package name it came from, because that is the fact a
//rename changes underneath everybody.

plugin.consumes = ['selftest', 'dataDir', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var dataDir = imports.dataDir;

    describe('where this app keeps things', function () {

        it('is under the place this platform puts application data', function () {
            var where = dataDir.path;

            assert.equal(typeof where, 'string');
            assert.ok(where.length > 0, 'no directory at all');

            var expected = process.platform === 'win32'
                ? (process.env.LOCALAPPDATA || os.homedir())
                : path.join(os.homedir(), '.config');

            assert.ok(where.indexOf(expected) === 0,
                where + ' is not under ' + expected);
        });

        //THE NAME IS THE FACT A RENAME CHANGES, so a path that could not say
        //where it came from would leave somebody with an empty directory and no
        //way to work out why.
        it('says which package name it came from, and uses it', function () {
            var name = imports.app.appPackage.name;

            assert.equal(dataDir.from, name);
            assert.ok(dataDir.path.indexOf(name) >= 0,
                dataDir.path + ' does not contain ' + name);
        });

        it('joins a path inside itself', function () {
            var one = dataDir.at('a', 'b.json');

            assert.ok(one.indexOf(dataDir.path) === 0, one + ' escaped ' + dataDir.path);
            assert.ok(one.indexOf('b.json') > 0);

            //and with nothing to join it is the directory itself, rather than
            //something with a trailing separator that compares unequal to it
            assert.equal(dataDir.at(), dataDir.path);
        });

        //READING A PATH MUST NOT CREATE A DIRECTORY. `at()` in a log line would
        //otherwise leave a folder behind as a side effect of describing one.
        it('at() makes nothing, ensure() makes it', function () {
            var probe = 'probe-' + process.pid;
            var where = dataDir.at(probe);

            assert.ok(!fs.existsSync(where), 'at() created ' + where);

            try {
                assert.equal(dataDir.ensure(probe), where);
                assert.ok(fs.existsSync(where), 'ensure() did not make ' + where);

                //and twice is not an error, because a plugin calling it on every
                //save is the ordinary case
                assert.equal(dataDir.ensure(probe), where);
            } finally {
                try { fs.rmSync(where, { recursive: true, force: true }); } catch (e) { /* leave it */ }
            }
        });
    });

    //WHICH SET OF DATA THIS RUN IS WORKING ON.
    //
    //THE APP IS NOT RUNNING UNDER ONE, and that is the case worth pinning: the
    //default has to stay exactly where it always was, or adding profiles would
    //have relocated everything already on disk on the release that added them.
    describe('which profile this is', function () {

        it('is the app own directory when nothing asked for one', function () {
            assert.equal(dataDir.profile, null, 'this run is in a profile: ' + dataDir.profile);
            assert.equal(dataDir.path, dataDir.root, 'the default no longer sits where it did');
        });

        //null AND NOT A WORD MEANING NONE. A screen saying `profile: default`
        //sends somebody looking for a directory called default, and there is
        //not one.
        it('says none as null, not as a name', function () {
            assert.notEqual(dataDir.profile, 'default');
            assert.notEqual(dataDir.profile, '');
        });

        //A SWITCH NOBODY CAN ENUMERATE is a switch with no way back except
        //remembering what you typed, so this lists them.
        it('can say what other worlds exist', function () {
            var found = dataDir.profiles();
            assert.ok(Array.isArray(found), 'profiles() is not a list');

            found.forEach(function (one) {
                assert.ok(typeof one === 'string' && one.length > 0, 'a nameless profile');
            });
        });

        //THE LAYOUT IS NAMED ONCE, in src/profile.js, so the boot that
        //validates a profile name and the plugin that builds the path cannot
        //come to differ about where profiles go.
        it('puts a profile where src/profile.js says it goes', function () {
            var FOLDER = require('../../../profile').FOLDER;

            assert.equal(FOLDER[0], '.', FOLDER + ' could collide with a drawer an app asks for');
            assert.ok(dataDir.at(FOLDER).indexOf(dataDir.root) === 0);
        });
    });

    register();
}
module.exports = plugin;
