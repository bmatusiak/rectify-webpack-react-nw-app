var fs = require('node:fs');
var path = require('node:path');

//---------------------------------------------------------------------------
//THE APP'S STATE: the small things it keeps between restarts.
//
//This is the app's, on disk, and it is the other half of a pair. ../webStorage
//holds the PERSON'S -- which tab they were on, which swatch they picked -- in
//the browser, where it disappears with their profile. What goes here is what the
//app itself would be sorry to lose:
//
//    ../webStorage   the person's   the browser   gone when the profile is
//                                                 cleared, OR the app renamed
//    here            the app's      dataDir       gone when you delete it
//
//THE DIFFERENCE IS NOT DURABILITY, IT IS OWNERSHIP, and getting it wrong is one
//directional. A preference kept here is merely in an odd place. Something
//authoritative kept over there is one rename away from gone -- see ../dataDir,
//which is where that trap is written down.
//
//A DOCUMENT, NOT A KEY-VALUE STORE. `doc('x')` is a whole json file read and
//written at once, because that is the unit a restart has to be atomic in: half
//of a settings file is not half a setting, it is a file that will not parse.
//
//WHAT ../dataDir CALLS ITS OWN, THIS PUTS THINGS IN. It does not work out where
//that is -- one derivation of that fact, over there, is the whole point of that
//plugin existing.
//
//---- what this deliberately does not have ---------------------------------
//
//NO SCOPES. The app this came from has a second drawer -- state about whichever
//workspace is currently open -- and a rule that folding the two together is not
//untidiness but CONTAMINATION: point the app at a second workspace and the
//first one's tasks are still there, answering, about things that are not in
//front of you. That is a real and hard-won lesson, and it is also about a
//concept this scaffold does not have. Shipping an empty second drawer would be
//shipping a hole. An app that needs one adds it on top of this.
//---------------------------------------------------------------------------

//A NAME IS LETTERS, DIGITS AND DASHES, and this is a refusal rather than a
//sanitiser. Quietly turning `../../etc/passwd` into `etcpasswd` writes a file
//somewhere surprising and says nothing; a name that is not a name is a caller
//bug, and it should be one at the call that made it.
function fileName(name) {
    var clean = String(name == null ? '' : name).trim();

    if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) {
        throw new Error('a kept thing is named in letters, digits and dashes -- "' + name + '" is not');
    }

    return clean + '.json';
}

module.exports.fileName = fileName;

plugin.consumes = ['dataDir'];
plugin.provides = ['state'];
async function plugin(imports, register) {
    var dataDir = imports.dataDir;

    //RESOLVED LAZILY, NOT AT SETUP. ../dataDir/server.js refuses when there is
    //no main half behind it, and a plugin that asked at load time would turn
    //"this half cannot store things" into "this half will not load".
    function where() { return dataDir.ensure('state'); }

    function doc(name) {
        var leaf = fileName(name);

        return {
            //the path is a getter, so asking what it is does not create the
            //directory -- the same cut ../dataDir makes between `at` and `ensure`
            get path() { return path.join(dataDir.at('state'), leaf); },

            //A MISSING FILE AND AN UNREADABLE ONE BOTH ANSWER THE FALLBACK.
            //Neither is recoverable here and both mean "there is nothing to go
            //on" -- the difference is worth a line in a log, not a decision at
            //every call site.
            read: function (fallback) {
                var text;

                try { text = fs.readFileSync(this.path, 'utf8'); }
                catch (e) { return fallback; }

                //A BYTE-ORDER MARK IN FRONT OF THE BRACE is what a file picks up
                //from having been opened in an editor on windows, and JSON.parse
                //refuses it -- which reads as corruption rather than as a BOM.
                try { return JSON.parse(text.replace(/^﻿/, '')); }
                catch (e) { return fallback; }
            },

            //WRITTEN BESIDE AND MOVED INTO PLACE. Writing straight over the real
            //file leaves a window in which it is half a document -- and a reader
            //that opens it then does not get an error, it gets the FALLBACK,
            //which every call site treats as "nothing kept yet". Losing
            //everything to a flicker mid-write is a silent, total loss that reads
            //as a fresh install.
            write: function (value) {
                var dir = where();
                var file = path.join(dir, leaf);
                var beside = file + '.writing';

                fs.writeFileSync(beside, JSON.stringify(value, null, 2));
                fs.renameSync(beside, file);

                return value;
            },

            //FOR A THING THAT SHOULD STOP EXISTING rather than become `{}`. An
            //empty document and no document are different answers, and only one
            //of them means "this was never set up".
            forget: function () {
                try { fs.unlinkSync(this.path); return true; }
                catch (e) { return false; }
            }
        };
    }

    await register(null, {
        state: {
            doc: doc,

            //where the drawer is, for anything that wants to say so on screen or
            //in a log. A getter, so it does not make the directory just to
            //describe it.
            get where() { return dataDir.at('state'); },

            //WHAT IS KEPT, for a person looking rather than for anything that
            //runs. A store nobody can list is a store nobody can clean up.
            names: function () {
                try {
                    return fs.readdirSync(dataDir.at('state'))
                        .filter(function (f) { return /\.json$/.test(f); })
                        .map(function (f) { return f.replace(/\.json$/, ''); })
                        .sort();
                } catch (e) {
                    return [];//nothing kept yet is not an error
                }
            }
        }
    });
}
module.exports = plugin;
