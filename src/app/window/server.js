//the same plugin, seen from the app's node half.
//
//the window itself is owned by ./main.js, because it has to outlive the bundle
//this half lives in. what arrives here is a controller, handed over on the host.

plugin.consumes = ['app', 'ipc'];
plugin.provides = ['window'];
async function plugin(imports, register) {
    var control = imports.app.host.window;
    var ipc = imports.ipc;

    //the cli asks for these, and this plugin is what owns them
    var answered = [
        ipc.handle('open', function () { control.show(); return 'shown'; }),
        ipc.handle('hide', function () { control.hide(); return 'hidden'; }),
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
