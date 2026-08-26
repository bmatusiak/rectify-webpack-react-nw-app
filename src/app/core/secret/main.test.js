var fs = require('node:fs');

//KEEPING SOMETHING, IN THE APP THAT WOULD KEEP IT.
//
//What ./seal.js DOES is checked in ./node.test.js, including a real DPAPI round
//trip. This is about the plugin over it: where the file goes, what mode it has,
//and the difference between a secret that is missing and one that cannot be
//opened.
//
//EVERY NAME HERE IS A PROBE AND EVERY TEST CLEANS UP. This writes into the data
//directory of an app somebody is using.

plugin.consumes = ['selftest', 'secret', 'dataDir'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var secret = imports.secret;

    var made = [];

    function name(label) {
        var one = 'probe-' + label + '-' + process.pid;
        made.push(one);
        return one;
    }

    function tidy() {
        made.forEach(function (one) { secret.forget(one); });
        made.length = 0;
    }

    describe('something worth keeping', function () {

        it('is under the data directory, beside the state rather than in it', function () {
            assert.ok(secret.where.indexOf(imports.dataDir.path) === 0,
                secret.where + ' is not under ' + imports.dataDir.path);

            assert.notEqual(secret.where, imports.dataDir.at('state'),
                'secrets and ordinary state are in the same folder');
        });

        it('keeps something and gives it back', function () {
            try {
                var one = name('roundtrip');
                var value = 'ghp_' + 'A'.repeat(36);

                var kept = secret.keep(one, value);
                assert.equal(kept.sealed, secret.can, 'it disagrees with what the platform can do');

                assert.equal(secret.read(one), value);
            } finally { tidy(); }
        });

        //ON A MACHINE THAT CAN SEAL, WHAT IS ON DISK IS NOT THE VALUE. That is the
        //whole claim, and reading the file directly is the only way to make it.
        it('what lands on disk is not the thing you kept', function () {
            try {
                var one = name('opaque');
                var value = 'a-very-recognisable-secret';

                var kept = secret.keep(one, value);
                var raw = fs.readFileSync(kept.path, 'utf8');

                if (secret.can) {
                    assert.equal(raw.indexOf(value), -1, 'the secret is sitting there in cleartext');
                    assert.equal(secret.sealed(one), true);
                } else {
                    //NOTHING IS PRETENDED on a platform that cannot seal -- the
                    //file is the value, protected by its mode, and `sealed` says
                    //so rather than claiming otherwise.
                    assert.ok(raw.indexOf(value) >= 0);
                    assert.equal(secret.sealed(one), false);
                }
            } finally { tidy(); }
        });

        //MODE 0600 IS THE WHOLE PROTECTION where sealing is not available, and
        //still worth having where it is. `writeFileSync` only applies a mode when
        //it CREATES the file, which is why keep() writes a fresh path and renames.
        it('is not readable by anybody else', function () {
            if (process.platform === 'win32') return;//posix modes, posix test

            try {
                var one = name('mode');
                var kept = secret.keep(one, 'x');

                var mode = fs.statSync(kept.path).mode & 0o777;
                assert.equal(mode, 0o600, 'the mode is ' + mode.toString(8));
            } finally { tidy(); }
        });

        //A MISSING SECRET AND AN UNOPENABLE ONE ARE DIFFERENT ANSWERS, and it
        //matters more here than anywhere else: "there is nothing kept" invites
        //writing a new one, and "this was sealed by another account" invites
        //finding out whose.
        it('a secret that was never kept answers the fallback', function () {
            assert.equal(secret.read('probe-never-kept-' + process.pid, 'nothing'), 'nothing');
        });

        it('forgetting one makes it stop existing', function () {
            var one = name('forgotten');
            var kept = secret.keep(one, 'x');

            assert.ok(fs.existsSync(kept.path));
            assert.equal(secret.forget(one), true);
            assert.ok(!fs.existsSync(kept.path), 'the file is still there');

            assert.equal(secret.read(one, 'gone'), 'gone');
            made.length = 0;
        });

        it('lists what is kept, by name and not by value', function () {
            try {
                var one = name('listed');
                secret.keep(one, 'a-value');

                var names = secret.names();
                assert.ok(names.indexOf(one) >= 0, 'it is not listed: ' + names.join(', '));
                assert.equal(names.join(' ').indexOf('a-value'), -1, 'the listing leaked a value');
            } finally { tidy(); }
        });

        it('refuses a name that could escape the folder', function () {
            ['../escape', 'a/b', '', '   ', '.hidden', null].forEach(function (bad) {
                var refused = null;
                try { secret.keep(bad, 'x'); } catch (e) { refused = e; }
                assert.ok(refused, JSON.stringify(bad) + ' was accepted as a name');
            });
        });

        //`can` IS ASKED BEFORE KEEPING, not after -- "store it only if you can
        //protect it" is a reasonable policy and cannot be expressed afterwards.
        it('says whether it can protect anything, before being asked to', function () {
            assert.equal(typeof secret.can, 'boolean');
            assert.equal(secret.can, process.platform === 'win32');
        });
    });

    register();
}
module.exports = plugin;
