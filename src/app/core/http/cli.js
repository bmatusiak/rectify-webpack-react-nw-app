//`npm run cli -- serve on` — the same switch the tray flips.
//
//A COMMAND HERE ONLY BECAUSE THE WORDS MATTER. Anything the cli's table does
//not know is forwarded to the running app, so `serve '{"on":true}'` already
//reached ../http without a line of this. What it did not do was read like
//something a person types, or print the address afterwards, or refuse a third
//word rather than quietly doing nothing with it.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    //what a person might reasonably type for each answer
    var ON = ['on', 'yes', 'true', 'start', '1'];
    var OFF = ['off', 'no', 'false', 'stop', '0'];

    cli.command('serve', {
        help: 'let a browser be a client   [on|off]',
        args: ['on'],
        run: async function (data) {
            var said = data.on === undefined ? null : String(data.on).toLowerCase();

            //ASKED FOR NOTHING MEANS ASKED WHAT IT IS. A toggle that flips on a
            //bare `serve` would be a trap in a script: the same command twice
            //leaves it where it started.
            var want;
            if (said === null) want = undefined;
            else if (ON.indexOf(said) >= 0) want = true;
            else if (OFF.indexOf(said) >= 0) want = false;
            else throw new Error('say `serve on` or `serve off`, not "' + data.on + '"');

            var out = await ipc.call('serve', want === undefined ? {} : { on: want }, 10000);

            if (!out.serving) {
                console.log('the browser viewer is off');
                //in development the port stays up because webpack needs it, and
                //saying so is the difference between "off" and "broken"
                if (out.listening) console.log('  ' + out.url + '  (still hosting the window half for webpack)');
                return;
            }

            console.log('serving at ' + out.url);
        }
    });

    await register(null, {});
}
module.exports = plugin;
