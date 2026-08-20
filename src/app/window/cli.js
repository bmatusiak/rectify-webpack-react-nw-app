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

    cli.command('capture', {
        help: 'save a picture of the window  [{"path":"shot.png","format":"jpeg"}]',
        run: async function (data) {
            var format = data.format == 'jpeg' ? 'jpeg' : 'png';
            var file = path.resolve(data.path || stamp(format));

            //longer than the default: a frame has to be drawn and a file written
            var shot = await ipc.call('capture', { path: file, format: format }, 20000);

            //the size comes out of the file's own header, so it is what was
            //captured rather than what the window was asked to be
            var size = shot.width ? shot.width + 'x' + shot.height + ', ' : '';

            console.log(shot.path);
            console.log('  ' + Math.round(shot.bytes / 1024) + ' kb, ' + size + shot.format);
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
