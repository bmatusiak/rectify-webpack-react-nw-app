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
//---- two drawers, and which one a thing goes in is the whole design -------
//
//    state.doc(x)        true whatever the app has open -- its settings, the
//                        list of namespaces, WHICH namespace is open
//    state.here.doc(x)   about the one that is open, and gone from view when a
//                        different one is
//
//FOLDING THEM TOGETHER IS NOT UNTIDINESS, IT IS CONTAMINATION: point the app at
//a second workspace and the first one's things are still there, answering,
//about something that is not in front of you. The app this came from learned
//that the hard way and its own comment names it -- "the contamination this whole
//file exists to prevent, arriving on the first switch".
//
//THIS FILE USED TO SAY IT WOULD NOT HAVE THE SECOND DRAWER, on the grounds that
//a scaffold with no concept of a workspace would be shipping a hole. What
//changed the answer is that the hole was in the other direction: `state`,
//`secret` and everything else that keeps something all root under ../dataDir,
//so an app adding namespacing "on top of this" would have had to add it to each
//of them separately, and they would have come to disagree.
//
//WHICH IS NOT THE SAME AS A PROFILE, and ../../../profile.js has the long
//version. A profile moves the ROOT, once, at boot: everything follows, including
//the drawer that is supposed to outlive namespaces. This moves a DRAWER, at
//runtime, repeatedly, and leaves that one where it is. `--profile=test` is
//"leave my real data alone"; a namespace is "I have three of these open".
//---------------------------------------------------------------------------

//THE NAMES, IN ./names.js, because ./server.js needs `slug` and needs nothing
//else here -- requiring this file to reach one pure function would pull the
//whole main-side plugin into the server bundle.
var names = require('./names');

var fileName = names.fileName;
var folderName = names.folderName;
var slug = names.slug;
var NAMESPACES = names.NAMESPACES;

//kept as this module's own exports as well, because they were here first and
//something may already be asking
module.exports.fileName = fileName;
module.exports.folderName = folderName;
module.exports.slug = slug;
module.exports.NAMESPACES = NAMESPACES;

plugin.consumes = ['dataDir'];
plugin.provides = ['state'];
async function plugin(imports, register) {
    var dataDir = imports.dataDir;

    //RESOLVED LAZILY, NOT AT SETUP. ../dataDir/server.js refuses when there is
    //no main half behind it, and a plugin that asked at load time would turn
    //"this half cannot store things" into "this half will not load".
    function where() { return dataDir.ensure('state'); }

    //---- who knows which namespace we are in --------------------------------
    //
    //ONE SLOT, NOT A LIST, and the direction is inverted on purpose.
    //
    //THIS MUST NOT CONSUME THE PLUGIN THAT KNOWS, because WHICH namespace is
    //open is itself a thing to keep -- and it is one that must survive the
    //switch, so it belongs in the app's own drawer, which is here. A plugin
    //keeping that in `state` while `state` asked it where we are would leave the
    //two waiting on each other.
    //
    //So the app hands its answer in. This never learns what a namespace IS; it
    //learns that somebody will say. Same shape as ../log's `keeper`, which is
    //the other place in this scaffold where core takes a policy from outside
    //rather than naming it.
    //
    //TWO THINGS CLAIMING TO KNOW WHERE WE ARE is the disagreement this whole
    //idea exists to prevent, so the second `follow` replaces the first rather
    //than joining it.
    var asking = null;

    //RESOLVED ON EVERY CALL, WHICH IS WHAT MAKES THE SWITCH AUTOMATIC. Nothing
    //subscribes and nothing reloads, so there is no moment where one part of the
    //app is still answering about the namespace before last.
    //
    //A NAME, NOT A PATH -- see `fileName`. An app whose namespaces are folders
    //turns one into a name with `slug` below rather than handing a path in.
    function here() {
        if (!asking) return null;

        var said;
        try { said = asking(); }
        catch (e) {
            //A NAMESPACE THAT CANNOT BE DETERMINED IS NOT AN ABSENT ONE, but
            //both mean there is nowhere to put anything -- and falling through
            //to the app's drawer would write one namespace's things into the
            //place that is supposed to outlive all of them.
            return null;
        }

        return said ? String(said) : null;
    }

    //ONE DOCUMENT, IN WHICHEVER DRAWER IT WAS ASKED FOR.
    //
    //`at` AND `ensure` ARE FUNCTIONS AND NOT PATHS, because the namespaced
    //drawer moves while the app is running. A document handed a string would be
    //a document about wherever we were when somebody asked for it, and the two
    //are indistinguishable at the call site -- which is how a write lands in the
    //namespace before last.
    function docIn(at, ensure, name) {
        var leaf = fileName(name);

        return {
            //the path is a getter, so asking what it is does not create the
            //directory -- the same cut ../dataDir makes between `at` and `ensure`
            get path() { return path.join(at(), leaf); },

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
                var dir = ensure();
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

    //THE APP'S OWN DRAWER: true whatever namespace is open, and the parent of
    //every namespaced one. This is what `state.doc` has always meant, and it
    //still means it -- making it follow the namespace would have relocated every
    //document already written, silently, on the release that added the feature.
    function doc(name) {
        return docIn(function () { return dataDir.at('state'); }, where, name);
    }

    //---- and the drawer for whatever is open now ----------------------------

    function nowhere(name) {
        throw new Error(
            'No namespace is open, so there is nowhere to keep "' + name + '". This is about '
            + 'whatever the app has open rather than about the app -- see state.doc for what is '
            + 'not. Ask state.here.open first if a caller can be in either position.');
    }

    function hereAt() {
        var name = here();
        if (!name) return null;
        return dataDir.at('state', NAMESPACES, folderName(name));
    }

    var inHere = {
        doc: function (name) {
            var now = here();
            if (!now) nowhere(name);

            //CHECKED HERE AS WELL AS INSIDE, which is not belt and braces.
            //`docIn` only resolves a directory when something reads the path or
            //writes, so a namespace called `../escape` was accepted by this call
            //and threw later, at a write several lines away -- pointing at the
            //line that saved something rather than the one that named the place.
            //The caller that made the mistake should be the one that hears about
            //it. Its own test caught this by expecting the throw here.
            folderName(now);

            //RESOLVED AGAIN INSIDE, not closed over. Between this call and the
            //write there is nothing stopping the namespace changing, and a
            //document that remembered the answer would put it in the old one.
            return docIn(
                function () { return hereAt() || nowhere(name); },
                function () {
                    var at = hereAt();
                    if (!at) nowhere(name);
                    fs.mkdirSync(at, { recursive: true });
                    return at;
                },
                name);
        },

        //WHETHER THERE IS ONE AT ALL, so a caller can ask before it decides
        //rather than reading a refusal as a fault. A getter and not a function,
        //because it is a fact about now and reads like one.
        get open() { return !!here(); },

        //THE NAME, for anything reporting what it is looking at
        get name() { return here(); },

        //null WHEN NOTHING IS OPEN, rather than the app's drawer. A screen about
        //nowhere must not be shown the contents of somewhere.
        get where() { return hereAt(); },

        names: function () {
            var at = hereAt();
            if (!at) return [];

            try {
                return fs.readdirSync(at)
                    .filter(function (f) { return /\.json$/.test(f); })
                    .map(function (f) { return f.replace(/\.json$/, ''); })
                    .sort();
            } catch (e) {
                return [];//nothing kept in this one yet
            }
        }
    };

    await register(null, {
        state: {
            doc: doc,

            //---- and the one for whatever is open ---------------------------
            here: inHere,

            //THE APP HANDS ITS ANSWER IN. Returns the undo, so a plugin that
            //reloads takes its own claim off rather than leaving a stale one --
            //`log.keeper` is the same shape for the same reason.
            follow: function (fn) {
                asking = fn;
                return function () { if (asking === fn) asking = null; };
            },

            //FOR AN APP WHOSE NAMESPACES ARE PATHS. Exposed rather than kept
            //private because the alternative is every such app writing its own,
            //and two of them would disagree about the hash -- which shows up as
            //a namespace losing everything it had the day somebody refactored.
            slug: slug,

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
