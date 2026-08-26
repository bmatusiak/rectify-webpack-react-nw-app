//SEALED THINGS, FROM THE HALF THAT KEEPS RESTARTING.
//
//./main.js owns it and ../build hands it over -- because two answers to "where
//does this live" is how a credential is written into one folder by the half that
//keeps it and looked for in another by the half that reads it.
//
//WITHOUT A MAIN HALF IT REFUSES, and here that is not a preference. ../log
//carries on because losing a log line costs a line. ../state refuses because
//state written to a plausible wrong path is state the next start will not find.
//This refuses for a third reason on top of that one: a stand-in that silently
//wrote cleartext somewhere would be worse than any error, because it would look
//exactly like success.

plugin.consumes = ['app'];
plugin.provides = ['secret'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.secret;

    if (real) return register(null, { secret: real });

    function noAnswer() {
        throw new Error(
            'This process cannot keep secrets -- there is no main half behind it, and the one place ' +
            'that seals them is core/secret/main.js. Nothing is written here on purpose: a stand-in ' +
            'that quietly stored cleartext would look exactly like the real thing.');
    }

    //THE WHOLE SURFACE REFUSES, and `can` is the one that answers -- a caller
    //asking "may I keep this" before keeping it should be told no rather than
    //handed a throw for asking.
    await register(null, {
        secret: {
            keep: noAnswer,
            read: noAnswer,
            forget: noAnswer,
            sealed: noAnswer,
            names: noAnswer,
            seal: noAnswer,
            open: noAnswer,
            isSealed: noAnswer,

            get where() { return noAnswer(); },
            get can() { return false; }
        }
    });
}
module.exports = plugin;
