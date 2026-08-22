//the same plugin, seen from the app's node half.
//
//the window itself is owned by ./main.js, because it has to outlive the bundle
//this half lives in. what arrives here is a controller, handed over on the host.

var fs = require('fs');
var path = require('path');

plugin.consumes = ['app', 'ipc', 'Plugin'];
plugin.provides = ['window'];
async function plugin(imports, register) {
    var control = imports.app.host.window;
    var ipc = imports.ipc;

    //rectify ships this base class as a plugin rather than as part of the
    //container, so wanting it is a dependency like any other. What it buys
    //here is `own`: the undo is written where the thing is done, rather than
    //in a teardown function kept in step with it by hand. This half is torn
    //down and rebuilt on every save, so that is not a small distinction --
    //a handler left behind is a second copy answering the next command.
    var self = new imports.Plugin('window');

    //the cli asks for these, and this plugin is what owns them
    function answer(name, fn) {
        var handle = ipc.handle(name, fn);
        self.own(function () { handle.remove(); });
    }

    answer('open', function () { control.show(); return 'shown'; });
    answer('hide', function () { control.hide(); return 'hidden'; });

    //A BROWSER VIEW, OPENED AND CLOSED FROM HERE.
    //
    //A second window on the same url with no bridge attached, which is what
    //makes it a browser rather than a second app window -- see ../window/main.js.
    //It exists so the socket.io path can be driven at all: the only other way to
    //get a viewer was to hand the url to whatever browser the machine has, which
    //nothing can close again or ask questions of.
    answer('browser', async function (data) {
        var what = (data && data.what) || 'list';

        if (what == 'open') return { opened: await control.openView(), views: control.views };
        if (what == 'close') return { closed: control.closeView(data && data.session), views: control.views };

        return { views: control.views };
    });

    //the buffer stops here rather than going down the socket: the wire is one
    //json object per line, and a megabyte of base64 on it would be a waste of
    //both ends when the file wants to be a file anyway
    answer('capture', async function (data) {
        var shot = await control.capture(data);
        var file = path.resolve(data.path || ('capture.' + (shot.format == 'jpeg' ? 'jpg' : 'png')));

        await fs.promises.writeFile(file, shot.buffer);

        return {
            path: file, bytes: shot.buffer.length, format: shot.format,
            width: shot.width, height: shot.height
        };
    });

    answer('quit', function () {
        //answer before going, or the caller only ever sees a dropped socket
        setTimeout(function () { control.quit('asked over ipc'); }, 50);
        return 'quitting';
    });

    await register(null, {
        onDestroy: self.unload,

        //api() copies the surface onto the instance and freezes it, so what
        //this registers is the plugin itself: an emitter with a stated set of
        //methods, rather than whatever object happened to be returned here.
        window: self.api({
            get url() { return control.url; },
            get isOpen() { return control.isOpen; },
            open: function () { control.open(); },
            show: function () { control.show(); },
            hide: function () { control.hide(); },
            openInBrowser: function () { control.openInBrowser(); },
            quit: function (reason) { control.quit(reason); }
        })
    });
}
module.exports = plugin;
