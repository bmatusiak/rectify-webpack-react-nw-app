//WHAT THE APP HAS DONE, SEEN FROM THE HALF THAT KEEPS RESTARTING.
//
//THE RECORD LIVES IN MAIN AND IS HANDED OVER, for the reason that is the whole
//point of the plugin: this half is rebuilt on every save, and a record that
//restarted with it would answer "what happened while I was away" with "I do not
//know". Same shape as ../log, ../state and ../secret.
//
//IT CARRIES ON RATHER THAN REFUSING, which is the opposite of ../state and the
//same as ../log -- and the difference is what the caller loses.
//
//`state` refuses because state at a plausible wrong path is state the next start
//will not find, and `secret` refuses because a stand-in that quietly wrote
//cleartext would look exactly like success. Losing a note about an act costs a
//line in a record. The act still happened, and the plugin that did it should not
//fail because nothing was there to write it down.
//
//SO `keep` IS A NO-OP AND `all` IS EMPTY, and `where` says so in words rather
//than naming a file that does not exist. A caller that wants to know whether it
//is really being recorded asks `kept`.

plugin.consumes = ['app'];
plugin.provides = ['events'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.events;

    if (real) return register(null, { events: real });

    await register(null, {
        events: {
            //ANSWERS null, THE WAY THE REAL ONE ANSWERS null FOR A LINE IT DID
            //NOT KEEP. A caller cannot tell "not worth keeping" from "nowhere to
            //keep it" from this alone, which is correct: neither is its problem,
            //and `kept` below is how to ask.
            keep: function () { return null; },
            all: function () { return []; },
            clear: function () { },

            worthKeeping: function () { return false; },

            //THE ONE HONEST WORD, and not a path. A screen reporting where the
            //record is kept must not print a plausible file name for a file
            //nothing is writing.
            get where() { return null; },
            get kept() { return false; },

            get policy() { return { keep: [], never: [], most: 0 }; },

            //ARITHMETIC, SO IT STILL WORKS -- a caller that only wants to know
            //what a line would look like written down has asked a question this
            //half can answer honestly.
            scrub: require('./keeping').scrub
        }
    });
}
module.exports = plugin;
