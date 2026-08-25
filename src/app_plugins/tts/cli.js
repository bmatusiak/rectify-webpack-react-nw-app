//`npm run cli -- say "the build is done"`, and the one that tells you what
//voices there are to ask for.
//
//These are here for the argument names and the help line. ./server.js answers
//both over ipc, so they are already reachable without this file -- as json, from
//a terminal that knew to guess. ../../app/remote/cli.js is the same idea.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    cli.command('say', {
        help: 'read something out loud   <text>',
        args: ['text'],

        //LONGER THAN THE OTHER TIMEOUTS ON PURPOSE. Speaking takes as long as
        //the words do -- a paragraph at rate 1 is comfortably past the eight
        //seconds a click is given, and a cli that gave up mid sentence would
        //report a failure for something that was working.
        run: async function (data) {
            var out = await ipc.call('say', data, 120000);
            console.log('said it, in ' + out.parts + (out.parts === 1 ? ' part' : ' parts'));
        }
    });

    cli.command('voices', {
        help: 'what voices are installed',
        run: async function () {
            var out = await ipc.call('voices', {}, 30000);

            //A MACHINE WITH NO SYNTHESIZER IS A NORMAL ANSWER, and saying so is
            //the whole value of this command: `say` going quiet is otherwise
            //indistinguishable from `say` being broken.
            if (!out.voices.length) return console.log(
                'none -- nothing on this machine can speak, so `say` will have nothing to say it with');

            out.voices.forEach(function (name) { console.log('  ' + name); });
        }
    });

    await register(null, {});
}
module.exports = plugin;
