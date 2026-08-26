var path = require('path');

//`npm run cli -- capture` — a photograph of the window, saved where you are.
//
//the path is resolved on this side on purpose. the app's working directory is
//wherever it was started from, which is not where you are typing, and a bare
//`shot.png` should land in front of you rather than somewhere it was launched
//from weeks ago.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    //THE OTHER HALF OF THE SAME QUESTION. A class that matches no rule is
    //invisible in the picture and obvious here; a value drawn from the wrong
    //field is the other way round.
    //
    //ANSWERED BY MAIN, unlike `capture` -- see ../window/main.js. The page worth
    //reading is usually the one that failed to render, and the node half may be
    //what failed.
    cli.command('markup', {
        help: 'save what the page is made of   [path]',
        args: ['path'],
        run: async function (data) {
            var out = await ipc.call('markup', data.path ? { path: path.resolve(data.path) } : {}, 20000);

            if (out.skipped) return console.log('nothing was read: ' + out.why);

            console.log(out.path);
            console.log('  ' + Math.round(out.bytes / 1024) + ' kb'
                + (out.redacted ? ', and something in it was redacted' : ''));

            //SAID EVERY TIME, NOT ONCE IN A README. This is a copy of the screen,
            //and redaction only catches what has a shape -- see core/window's
            //README. A short, plain secret on the page is in that file.
            console.log('  it holds whatever was on the screen; look before sharing it');
        }
    });

    cli.command('capture', {
        help: 'save a picture of the window   [path] [png|jpeg]',
        args: ['path', 'format'],
        run: async function (data) {
            var format = data.format == 'jpeg' ? 'jpeg' : 'png';
            var file = path.resolve(data.path || stamp(format));

            //longer than the default: a frame has to be drawn and a file written
            var shot = await ipc.call('capture', { path: file, format: format }, 20000);

            //NOTHING WAS WRITTEN, AND THE LINE SAYS WHICH FILE IT WOULD HAVE
            //BEEN. A skip printed as though it were a capture is how somebody
            //ends up looking at last week's picture.
            if (shot.skipped) return console.log('nothing was captured: ' + shot.why);

            //the size comes out of the file's own header, so it is what was
            //captured rather than what the window was asked to be
            var size = shot.width ? shot.width + 'x' + shot.height + ', ' : '';

            console.log(shot.path);
            console.log('  ' + Math.round(shot.bytes / 1024) + ' kb, ' + size + shot.format);
        }
    });

    //`npm run cli -- browser open` — a second viewer, on the socket.io path.
    //
    //THE ONLY WAY TO DRIVE THAT PATH AT ALL. `open in browser` hands the url to
    //whatever browser the machine has, which cannot be closed again or asked
    //anything; this opens one the app owns and can name.
    cli.command('browser', {
        help: 'a second viewer, over http   [open|close] [session]',
        args: ['what', 'session'],
        run: async function (data) {
            var what = (data.what || 'list').toLowerCase();
            if (['open', 'close', 'list'].indexOf(what) < 0)
                throw new Error('say `browser open`, `browser close` or `browser`, not "' + data.what + '"');

            var out = await ipc.call('browser', { what: what, session: data.session }, 20000);

            if (what == 'open') console.log('opened ' + out.opened);
            else if (what == 'close') console.log(out.closed.length
                ? 'closed ' + out.closed.join(', ')
                : 'nothing to close');

            console.log(out.views.length
                ? '  open: ' + out.views.join(', ')
                : '  no browser views open');
        }
    });

    await register(null, {});
}

function stamp(format) {
    var d = new Date();
    function two(n) { return String(n).padStart(2, '0'); }
    return 'capture-' +
        d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' +
        two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) +
        '.' + (format == 'jpeg' ? 'jpg' : 'png');
}

module.exports = plugin;
