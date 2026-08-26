var fs = require('node:fs');
var path = require('node:path');
var seal = require('./seal');

//---------------------------------------------------------------------------
//SOMETHING WORTH KEEPING, KEPT SO THAT HAVING THE FILE IS NOT ENOUGH.
//
//THE MECHANISM, NOT THE POLICY. This seals a value and gives it back; deciding
//WHAT is worth sealing, when to ask for it and what to do when it is gone is the
//app's business, and it is where an app's real logic lives. The line between the
//two is the reason this is in core and a credential manager would not be.
//
//---- what it protects against, and what it does not -----------------------
//
//NOT somebody running as you on this machine. Nothing on a single-user desktop
//can. It protects against the file being read SOMEWHERE ELSE -- a backup, a
//cloud-synced folder, a support bundle, a disk pulled out, a process running as
//another account. See ./seal.js, which carries the whole argument.
//
//---- it is the pair to ../state -------------------------------------------
//
//    ../state    the app's own things            plain json, readable
//    here        the ones worth protecting       sealed where it can be
//
//Both live under ../dataDir. The difference is not importance, it is whether
//having the file should be enough -- and a value that goes in the wrong one is
//either needlessly awkward or needlessly exposed.
//---------------------------------------------------------------------------

//A NAME IS A REFUSAL, NOT A SANITISER -- the same rule as ../state, and the same
//reason: quietly turning `../../etc/passwd` into something safe writes a file
//somewhere surprising and says nothing.
function fileName(name) {
    var clean = String(name == null ? '' : name).trim();

    if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) {
        throw new Error('a kept secret is named in letters, digits and dashes -- "' + name + '" is not');
    }

    return clean + '.sealed';
}

module.exports.fileName = fileName;

plugin.consumes = ['dataDir'];
plugin.provides = ['secret'];
async function plugin(imports, register) {
    var dataDir = imports.dataDir;

    //LAZY, LIKE ../state -- ../dataDir/server.js refuses when there is no main
    //half behind it, and asking at setup time would turn "this half cannot keep
    //secrets" into "this half will not load".
    function where() { return dataDir.ensure('secrets'); }
    function at(name) { return path.join(dataDir.at('secrets'), fileName(name)); }

    await register(null, {
        secret: {
            //---- the whole job, for anything that just wants it kept --------

            keep: function (name, value) {
                var file = path.join(where(), fileName(name));
                var out = seal.seal(value);

                //WRITTEN BESIDE AND MOVED INTO PLACE, the same as ../state: a
                //reader that opens a half-written file gets the fallback, which
                //every call site reads as "nothing kept yet" -- and for a
                //credential that is a silent, total loss dressed as first run.
                var beside = file + '.writing';

                //MODE 0600 ON THE WAY IN, which is the whole protection on the
                //platforms that cannot seal and is still worth having on the one
                //that can. `writeFileSync` only applies a mode when it CREATES
                //the file, which is why this writes to a fresh path each time
                //rather than over the old one.
                fs.writeFileSync(beside, out.data, { mode: 0o600 });
                fs.renameSync(beside, file);

                return { sealed: out.sealed, path: file };
            },

            read: function (name, fallback) {
                var raw;

                try { raw = fs.readFileSync(at(name)); }
                catch (e) { return fallback; }

                //AN UNOPENABLE SECRET IS NOT A MISSING ONE, and the difference
                //matters more here than anywhere else: "there is nothing kept"
                //invites writing a new one, and "this was sealed by another
                //account" invites finding out whose. So this throws rather than
                //falling back.
                return seal.open(raw).toString('utf8');
            },

            forget: function (name) {
                try { fs.unlinkSync(at(name)); return true; }
                catch (e) { return false; }
            },

            //WHETHER WHAT IS ON DISK IS REALLY CIPHERTEXT, without opening it --
            //so a screen reports the truth rather than the platform's promise,
            //and a file written before sealing existed is noticed rather than
            //assumed.
            sealed: function (name) {
                try { return seal.isSealed(fs.readFileSync(at(name))); }
                catch (e) { return false; }
            },

            names: function () {
                try {
                    return fs.readdirSync(dataDir.at('secrets'))
                        .filter(function (f) { return /\.sealed$/.test(f); })
                        .map(function (f) { return f.replace(/\.sealed$/, ''); })
                        .sort();
                } catch (e) {
                    return [];
                }
            },

            get where() { return dataDir.at('secrets'); },

            //---- and the mechanism, for anything keeping its own file -------
            //
            //`keep`/`read` ARE THE ONES TO USE. These are here because a plugin
            //that already owns a file -- a config with one secret field in it --
            //should not have to invent sealing a second time to protect that
            //field.
            seal: seal.seal,
            open: seal.open,
            isSealed: seal.isSealed,

            //WHETHER THIS MACHINE CAN SEAL AT ALL, and a caller needs this
            //BEFORE it decides to keep something: "store it only if you can
            //protect it" is a reasonable policy and cannot be expressed after
            //the fact.
            get can() { return seal.can(); }
        }
    });
}
module.exports = plugin;
