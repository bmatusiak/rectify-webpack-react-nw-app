var path = require('path');

//`node src/cli.js snapshot` -- both halves of one moment, from a terminal.
//
//THE PATH IS RESOLVED ON THIS SIDE ON PURPOSE. The app's working directory is
//wherever it was started from, which is not where you are typing, and a bare
//`bug.png` should land in front of you rather than somewhere it was launched
//from weeks ago.
//
//A DRIVEN RUN IS ASKED ABOUT, WHICH IS THE POINT OF THE GUARD. This command
//arrives over the control socket, so ../core/may raises the question in the
//window and waits for a person -- see ./main.js. From a terminal that is a
//moment's pause; from a model it is the whole difference.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    cli.command('snapshot', {
        help: 'a picture of the window and what the page is made of   [name]',
        args: ['name'],
        run: async function (data) {
            //LONGER THAN THE DEFAULT: a frame has to be drawn, two files
            //written, and a person may have to answer a question first.
            var out = await ipc.call('snapshot',
                data.name ? { path: path.resolve(data.name) } : {}, 120000);

            if (out.skipped) return console.log('nothing was written: ' + out.why);

            if (out.picture) console.log(out.picture + (out.pixels ? '  ' + out.pixels : ''));
            else console.log('  no picture: ' + out.pictureSkipped);

            if (out.markup) {
                console.log(out.markup + '  ' + Math.round(out.bytes / 1024) + ' kb'
                    + (out.redacted ? ', and something in it was redacted' : ''));
            } else console.log('  no markup: ' + out.markupSkipped);

            //SAID EVERY TIME, NOT ONCE IN A README. This is a copy of the
            //screen. The markup is scrubbed and redaction only catches what has
            //a shape; the picture is not scrubbed at all, because it is a
            //photograph. A short, plain secret on the page is in both.
            console.log('  they hold whatever was on the screen; look before sharing them');
        }
    });

    //THE MARKUP ON ITS OWN, WHICH IS THE HALF THAT SURVIVES A WINDOW THAT IS NOT
    //ON SCREEN. A minimized window has no frame to photograph and still has a
    //page to read.
    cli.command('markup', {
        help: 'save what the page is made of   [path]',
        args: ['path'],
        run: async function (data) {
            var out = await ipc.call('markup', data.path ? { path: path.resolve(data.path) } : {}, 120000);

            if (out.skipped) return console.log('nothing was read: ' + out.why);

            console.log(out.path);
            console.log('  ' + Math.round(out.bytes / 1024) + ' kb'
                + (out.redacted ? ', and something in it was redacted' : ''));
            console.log('  it holds whatever was on the screen; look before sharing it');
        }
    });

    await register(null, {});
}
module.exports = plugin;
