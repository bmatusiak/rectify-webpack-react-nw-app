var fs = require('node:fs');
var path = require('node:path');
var zlib = require('node:zlib');

var filing = require('./filing');
var tar = require('./tar');

//---------------------------------------------------------------------------
//WHERE FILES ARE KEPT, AND HOW THEY ARE READ BACK. Not what any of them mean.
//
//IT COMPLETES A SET RATHER THAN STARTING ONE:
//
//    ../state    the app's own things   json documents, readable
//    ../secret   the ones worth hiding  sealed where it can be
//    here        files                  bytes somebody handed over
//
//The difference is not importance, it is SHAPE. A build somebody produced, a
//report, an image, a log a machine printed -- none of those are a document to
//read and write whole, and putting one in `state` means keeping a megabyte of
//base64 inside a json file that something rewrites on every change.
//
//---- reading one back is part of keeping it -------------------------------
//
//So the refusals live here too, and each says its number: a binary is refused
//rather than rendered as replacement characters, something enormous is refused
//with its size rather than loaded into a panel, and an archive can be looked
//INSIDE without being unpacked to disk. A caller that only gets bytes back has
//to invent all three, and the second app to do that will invent them differently.
//
//---- nothing that arrives here is trusted ---------------------------------
//
//A NAME COMES WITH THE BYTES, from wherever they came from -- see ./filing.js,
//which is an allow list rather than a hunt for every spelling of `..`.
//---------------------------------------------------------------------------

plugin.consumes = ['dataDir', 'state', 'log'];
plugin.provides = ['archive'];
async function plugin(imports, register) {
    var { dataDir, state } = imports;
    var say = imports.log.on('archive');

    var FOLDER = 'archive';
    var ABOUT = '.about.json';

    //RESOLVED LAZILY, like ../state -- ../dataDir refuses when there is no main
    //half behind it, and asking at setup would turn "cannot keep files" into
    //"will not load".
    function root() { return dataDir.at(FOLDER); }

    //A DRAWER IS A DIRECTORY, so its name goes through the same rule the files
    //in it do -- refused with a sentence rather than sanitised.
    function drawerAt(where, name) {
        var no = filing.nameIsOk(name);
        if (no) throw new Error('a store is named the way a file is: ' + no);

        return path.join(where, name);
    }

    function store(where, name) {
        var dir = drawerAt(where, name);

        function at(file) { return path.join(dir, file); }

        var mine = {
            name: name,
            get where() { return dir; },

            //THE REFUSALS ARE ANSWERS, NOT THROWS. Everything that can go wrong
            //here is something the caller has to explain to whoever sent the
            //bytes, and an exception is the shape that makes a caller either
            //swallow it or crash. A name that is not a name is the exception --
            //that is a bug in the caller, not a fact about the bytes.
            keep: function (file, bytes, about) {
                var no = filing.nameIsOk(file);
                if (no) return { refused: no };

                var body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes == null ? '' : bytes));

                if (body.length > filing.MOST) {
                    return {
                        refused: 'that is ' + body.length + ' bytes, and the most this keeps is '
                            + filing.MOST
                    };
                }

                try {
                    fs.mkdirSync(dir, { recursive: true });

                    //WRITTEN BESIDE AND MOVED INTO PLACE, like ../state. A
                    //reader that opens a half-written file here gets half a
                    //build, which is worse than no build: it looks like one.
                    var beside = at(file) + '.writing';

                    fs.writeFileSync(beside, body);
                    fs.renameSync(beside, at(file));

                    if (about) {
                        fs.writeFileSync(at(file) + ABOUT, JSON.stringify({
                            about: filing.safe(about),
                            kept: new Date().toISOString()
                        }, null, 2));
                    }
                } catch (e) {
                    say.warn('could not keep ' + file + ' in ' + name + ': ' + ((e && e.message) || e));
                    return { refused: 'it could not be written: ' + ((e && e.message) || e) };
                }

                return { file: file, bytes: body.length, kept: true };
            },

            list: function () {
                var found = [];

                try {
                    fs.readdirSync(dir).forEach(function (file) {
                        //THE SIDECAR IS NOT A FILE SOMEBODY KEPT, and neither is
                        //a write that was interrupted.
                        if (file.indexOf(ABOUT, file.length - ABOUT.length) >= 0) return;
                        if (/\.writing$/.test(file)) return;

                        var stat;
                        try { stat = fs.statSync(at(file)); } catch (e) { return; }
                        if (!stat.isFile()) return;

                        var note = null;
                        try { note = JSON.parse(fs.readFileSync(at(file) + ABOUT, 'utf8')); }
                        catch (e) { /* nothing was said about it */ }

                        found.push({
                            file: file,
                            bytes: stat.size,
                            kept: (note && note.kept) || stat.mtime.toISOString(),
                            about: (note && note.about) || null
                        });
                    });
                } catch (e) { return []; }//nothing kept in this one yet

                return found.sort(function (a, b) { return String(b.kept).localeCompare(String(a.kept)); });
            },

            has: function (file) {
                if (filing.nameIsOk(file)) return false;
                try { return fs.statSync(at(file)).isFile(); } catch (e) { return false; }
            },

            //READ BACK AS SOMETHING A PERSON CAN LOOK AT, or a sentence saying
            //why not. Four answers, and which one it is matters:
            //
            //    { text }       it is text, and small enough
            //    { entries }    it is an archive, so here is what is in it
            //    { refused }    it is binary, or enormous, or not there
            read: function (file) {
                var no = filing.nameIsOk(file);
                if (no) return { refused: no };

                var stat;
                try { stat = fs.statSync(at(file)); }
                catch (e) { return { refused: 'there is nothing called "' + file + '" kept here' }; }

                if (stat.size > filing.READABLE) {
                    return {
                        refused: 'that is ' + stat.size + ' bytes -- open it from ' + dir
                            + ' rather than reading it here',
                        bytes: stat.size
                    };
                }

                var body;
                try { body = fs.readFileSync(at(file)); }
                catch (e) { return { refused: 'it could not be read: ' + ((e && e.message) || e) }; }

                //AN ARCHIVE IS LOOKED INSIDE RATHER THAN REFUSED AS BINARY,
                //which is the one thing that makes `read` useful for the file
                //type people actually hand around. ./tar.js refuses a gzipped
                //one, so unpacking it is this file's job -- zlib is node's, and
                //tar is the half it has no opinion about.
                var raw = body;
                var gzip = tar.looksGzipped(body);

                if (gzip) {
                    try { raw = zlib.gunzipSync(body); }
                    catch (e) {
                        return { refused: 'it says it is gzipped and does not unpack: ' + ((e && e.message) || e) };
                    }
                }

                if (tar.looksTar(raw)) {
                    var inside = tar.entries(raw);

                    if (inside.unreadable) return { refused: inside.unreadable, gzip: gzip, tar: true };
                    return { entries: inside.files, gzip: gzip, tar: true, bytes: stat.size };
                }

                //A GZIPPED SOMETHING-ELSE is readable if what came out is text
                if (!filing.looksText(raw)) {
                    return {
                        refused: 'it is not text -- open it from ' + dir + ' with something that '
                            + 'understands it',
                        gzip: gzip, bytes: stat.size
                    };
                }

                return { text: raw.toString('utf8'), gzip: gzip, bytes: stat.size };
            },

            forget: function (file) {
                if (filing.nameIsOk(file)) return false;

                try { fs.unlinkSync(at(file)); }
                catch (e) { return false; }

                try { fs.unlinkSync(at(file) + ABOUT); } catch (e) { /* may never have been written */ }
                return true;
            },

            //WHAT THIS DRAWER COSTS, which is the question somebody asks before
            //deciding whether to delete it.
            get bytes() {
                return mine.list().reduce(function (n, f) { return n + f.bytes; }, 0);
            },

            empty: function () {
                var gone = 0;
                mine.list().forEach(function (f) { if (mine.forget(f.file)) gone++; });
                return gone;
            },

            //EMPTYING A DRAWER AND THROWING IT AWAY ARE DIFFERENT THINGS, and
            //only one of them existed. An empty drawer is still a drawer -- it
            //is in `stores()` and somebody may put something back in it -- so
            //`empty` leaves the directory, which is right, and left every test
            //that used it with a folder to remove behind the plugin's back.
            //
            //A CALLER REACHING FOR fs TO FINISH WHAT A PLUGIN STARTED is the
            //sign of a missing verb, not of a careless caller.
            drop: function () {
                var gone = mine.empty();

                //ONLY IF IT IS REALLY EMPTY. `rmdir` refuses a directory with
                //anything left in it, and that refusal is worth keeping: a file
                //this does not recognise is still somebody's file.
                try { fs.rmdirSync(dir); } catch (e) { /* not empty, or never made */ }

                return gone;
            }
        };

        return mine;
    }

    //---- and the drawers for whatever the app has open ---------------------
    //
    //THE SAME SHAPE AS ../state's `here`, and for the same reason: what a
    //namespace produced belongs with that namespace. Point the app at a second
    //one and the first one's files are not sitting there, about work that is not
    //in front of you.
    //
    //IT ASKS ../state RATHER THAN KEEPING ITS OWN ANSWER. Two plugins each
    //deciding which namespace is open is the disagreement `follow` exists to
    //prevent, and a second copy of it here would be the first thing to drift.
    function nowhere(name) {
        throw new Error(
            'No namespace is open, so there is nowhere to keep files for "' + name + '". This is '
            + 'about whatever the app has open rather than about the app -- see archive.store for '
            + 'what is not. Ask archive.here.open first if a caller can be in either position.');
    }

    var inHere = {
        store: function (name) {
            if (!state.here.open) nowhere(name);
            return store(path.join(state.here.where, FOLDER), name);
        },

        get open() { return state.here.open; },
        get where() { return state.here.open ? path.join(state.here.where, FOLDER) : null; },

        stores: function () { return listStores(inHere.where); }
    };

    function listStores(where) {
        if (!where) return [];

        try {
            return fs.readdirSync(where, { withFileTypes: true })
                .filter(function (e) { return e.isDirectory(); })
                .map(function (e) { return e.name; })
                .sort();
        } catch (e) {
            return [];//none made yet
        }
    }

    await register(null, {
        archive: {
            store: function (name) { return store(root(), name); },
            here: inHere,

            get where() { return root(); },
            stores: function () { return listStores(root()); },

            //ASKABLE BEFORE ANYTHING IS KEPT, so a caller can decide rather than
            //find out from a refusal
            nameIsOk: filing.nameIsOk,
            MOST: filing.MOST,
            READABLE: filing.READABLE
        }
    });
}
module.exports = plugin;
