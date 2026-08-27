var fs = require('node:fs');
var path = require('node:path');

var Drawers = require('./drawers');

//---------------------------------------------------------------------------
//AN ANSWER SOMEBODY ALREADY WORKED OUT. ./drawers.js holds the rule and the
//three doors; what is here is where the one kind worth writing down gets
//written, and why it lives in main.
//
//IT IS IN MAIN AND NOT IN THE NODE HALF, which is the one decision this file
//makes on its own.
//
//The server half is rebuilt and re-run on every save. A cache kept there is
//emptied by every edit -- so during the hours somebody is actually working on
//the app, it is never warm, and the thing it exists to avoid runs every time.
//main is loaded once. It is the same argument ../ipc makes for keeping its
//handler table there while the handlers register into it from the half that
//reloads.
//
//AND IT COSTS NOTHING, because in development main and the node half are the
//same node process: reaching this is a function call, not a message. The app
//this came from puts its drawers in the reloading half and pays that price.
//
//WHAT IS WRITTEN DOWN IS ONLY EVER byContent. ./drawers.js enforces that rather
//than trusting each call site -- see the comment on `written` there, which is
//about a file that may be a sealed credential.
//---------------------------------------------------------------------------

plugin.consumes = ['dataDir', 'log'];
plugin.provides = ['cached'];
async function plugin(imports, register, config) {
    var dataDir = imports.dataDir;
    var say = imports.log.on('cached');

    var FOLDER = 'cache';

    //A NAME BECOMES A FILE, so it is refused rather than sanitised -- the same
    //rule and the same reason as ../state's document names.
    function fileFor(name) {
        var clean = String(name == null ? '' : name).trim();

        if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) {
            throw new Error('a drawer is named in letters, digits and dashes -- "' + name + '" is not');
        }

        return clean + '.json';
    }

    //RESOLVED LAZILY, like ../state: ../dataDir refuses when there is no main
    //half behind it, and asking at setup would turn "cannot persist" into "will
    //not load".
    function at(name) { return path.join(dataDir.at(FOLDER), fileFor(name)); }

    //NOTHING HERE THROWS, AND THAT IS THE DIFFERENCE FROM ../state.
    //
    //A record that cannot be written is a loss. A cache that cannot be written
    //is a cache -- it starts empty and works. So a failure to read or write is
    //worth a log line and nothing more, and the caller is never told, because
    //there is nothing for the caller to do about it.
    function load(name) {
        try { return JSON.parse(fs.readFileSync(at(name), 'utf8')); }
        catch (e) { return null; }//never written, or not readable: both mean cold
    }

    var pending = Object.create(null);

    function save(name, pairs) {
        //WRITTEN AT THE END OF THE TICK, NOT ON EVERY PUT. A drawer being filled
        //in a loop would otherwise write the whole file once per answer, which
        //turns a cache into the slowest thing on the page.
        //
        //AND THE LATEST VALUE WINS, WHICH THE FIRST VERSION GOT BACKWARDS. It
        //captured the pairs from the call that scheduled the timer and ignored
        //every one after it -- so filling a drawer and clearing it in the same
        //tick wrote the fill and dropped the clear, leaving a file on disk for a
        //drawer that no longer had anything in it.
        var already = name in pending;
        pending[name] = pairs;
        if (already) return;

        var timer = setTimeout(function () {
            var latest = pending[name];
            delete pending[name];

            try {
                var file = path.join(dataDir.ensure(FOLDER), fileFor(name));

                //AN EMPTY DRAWER IS NO FILE, NOT AN EMPTY FILE. `clear()` used
                //to write `[]`, which leaves something on disk that a reader has
                //to open to discover is nothing -- and left every test's probe
                //drawer sitting in the real cache folder afterwards.
                if (!latest.length) {
                    try { fs.unlinkSync(file); } catch (e) { /* never written */ }
                    return;
                }

                var beside = file + '.writing';

                //WRITTEN BESIDE AND MOVED INTO PLACE, like ../state -- a reader
                //that opens a half-written file here gets a parse failure, which
                //`load` reads as "cold". Not a loss, but it would throw the
                //whole drawer away for one interrupted write.
                fs.writeFileSync(beside, JSON.stringify(latest));
                fs.renameSync(beside, file);
            } catch (e) {
                say.warn('could not write the ' + name + ' drawer: ' + ((e && e.message) || e));
            }
        }, 0);

        //A CACHE MUST NOT KEEP THE PROCESS ALIVE. Without this, a pending write
        //is an open handle at the moment somebody asked the app to quit.
        if (timer && timer.unref) timer.unref();
    }

    var drawers = Drawers({
        //`config.cached`, NOT `config` -- the third argument is the whole of
        //src/config.js, indexed by the service name. ../events had the same
        //line and it meant the configured policy was never read at all.
        keep: (config && config.cached && config.cached.keep) || undefined,
        load: load,
        save: save
    });

    //DEFINED RATHER THAN Object.assign'd, because `where` is a getter and
    //assigning would copy what it answered AT SETUP -- calling ../dataDir at the
    //one moment this file is careful not to.
    Object.defineProperty(drawers, 'where', {
        get: function () { return dataDir.at(FOLDER); },
        enumerable: true
    });

    //REFUSED AT THE CALL THAT NAMED IT, not at the write.
    //
    //`fileFor` is only reached when a drawer is saved, so `byContent('../x')`
    //was accepted and threw later -- from a line that is writing a file, several
    //calls away from the one that chose the name. Its own test caught this by
    //expecting the throw where the mistake is.
    //
    //ALL THREE DOORS, though only one ever becomes a file: a drawer name is a
    //name, it appears in `stats()` for a person to read, and a clock-keyed
    //drawer today is a content-keyed one after somebody changes their mind.
    ['byContent', 'byStamp', 'whileFresh'].forEach(function (door) {
        var make = drawers[door];

        drawers[door] = function (name, window) {
            fileFor(name);
            return make(name, window);
        };
    });

    await register(null, {
        cached: Object.assign(drawers, {
            //THROW THE WRITTEN ONES AWAY TOO. `stale()` is for a write and
            //deliberately leaves content-keyed answers alone; this is for a
            //person who wants the disk back.
            forgetEverything: function () {
                var gone = 0;

                try {
                    fs.readdirSync(dataDir.at(FOLDER)).forEach(function (f) {
                        if (!/\.json$/.test(f)) return;
                        fs.unlinkSync(path.join(dataDir.at(FOLDER), f));
                        gone++;
                    });
                } catch (e) { /* nothing written yet */ }

                return gone;
            }
        })
    });
}
module.exports = plugin;
