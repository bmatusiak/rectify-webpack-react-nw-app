var filing = require('./filing');

//WHERE FILES ARE KEPT, SEEN FROM THE HALF THAT KEEPS RESTARTING.
//
//IT IS MAIN'S AND IS HANDED OVER, like ../state and ../secret: one answer to
//"where does this live" is the whole point of ../dataDir existing, and two
//halves each working it out is how something gets written into one folder by the
//half that saves it and looked for in another by the half that reads it.
//
//WITHOUT A MAIN HALF IT REFUSES, and it belongs with ../state rather than with
//../cached on that question.
//
//A CACHE WITH NOWHERE TO WRITE IS A COLD CACHE -- nothing is lost, because
//everything in it can be worked out again. What is kept HERE cannot: it is bytes
//somebody handed over, and if they are written to a plausible wrong path they
//are gone and nothing says so. A stand-in that wrote to a temp folder would
//report every keep as a success and lose the lot at the next reboot.

plugin.consumes = ['app'];
plugin.provides = ['archive'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.archive;

    if (real) return register(null, { archive: real });

    function noAnswer() {
        throw new Error(
            'This process has nowhere to keep files -- there is no main half behind it, and the ' +
            'one place that owns the folder is core/archive/main.js. Nothing is guessed here on ' +
            'purpose: bytes written to a plausible wrong path are bytes nobody will find, and ' +
            'unlike a cache they cannot be worked out again.');
    }

    await register(null, {
        archive: {
            store: noAnswer,
            stores: noAnswer,
            get where() { return noAnswer(); },

            here: {
                store: noAnswer,
                stores: noAnswer,

                //FALSE, NOT A REFUSAL -- "is a namespace open" has a true answer
                //here and it is no. The same call ../state/server.js makes.
                get open() { return false; },
                get where() { return null; }
            },

            //THE RULE STILL ANSWERS, because it is text and has nothing to do
            //with a folder: a caller that wants to know whether a name would be
            //accepted BEFORE it goes looking for somewhere to put it has asked a
            //question this half can answer honestly.
            nameIsOk: filing.nameIsOk,
            MOST: filing.MOST,
            READABLE: filing.READABLE
        }
    });
}
module.exports = plugin;
