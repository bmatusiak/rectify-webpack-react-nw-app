//the same plugin, seen from the app's node half.
//
//the window itself is owned by ./main.js, because it has to outlive the bundle
//this half lives in. what arrives here is a controller, handed over on the host.

var fs = require('fs');
var path = require('path');

plugin.consumes = ['app', 'ipc'];
plugin.provides = ['window'];
async function plugin(imports, register) {
    var control = imports.app.host.window;
    var ipc = imports.ipc;

    //the cli asks for these, and this plugin is what owns them
    var answered = [
        ipc.handle('open', function () { control.show(); return 'shown'; }),
        ipc.handle('hide', function () { control.hide(); return 'hidden'; }),
        //the buffer stops here rather than going down the socket: the wire is
        //one json object per line, and a megabyte of base64 on it would be a
        //waste of both ends when the file wants to be a file anyway
        ipc.handle('capture', async function (data) {
            var shot = await control.capture(data);
            var file = path.resolve(data.path || ('capture.' + (shot.format == 'jpeg' ? 'jpg' : 'png')));

            await fs.promises.writeFile(file, shot.buffer);

            return {
                path: file, bytes: shot.buffer.length, format: shot.format,
                width: shot.width, height: shot.height
            };
        }),

        ipc.handle('quit', function () {
            //answer before going, or the caller only ever sees a dropped socket
            setTimeout(function () { control.quit('asked over ipc'); }, 50);
            return 'quitting';
        })
    ];

    await register(null, {
        onDestroy: function () { while (answered.length) answered.pop().remove(); },
        window: {
            get url() { return control.url; },
            get isOpen() { return control.isOpen; },
            open: function () { control.open(); },
            show: function () { control.show(); },
            hide: function () { control.hide(); },
            openInBrowser: function () { control.openInBrowser(); },
            quit: function (reason) { control.quit(reason); }
        }
    });
}
module.exports = plugin;
