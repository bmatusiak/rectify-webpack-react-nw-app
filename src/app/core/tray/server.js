//THE ICON IS ./main.js's, for the same reason ../ipc's listener is: this half
//is rebuilt on every save and an icon rebuilt with it would flicker out of the
//tray, or stack up a second one beside the first. Items added
//here are given back on reload, so a save does not leave a second copy of
//every menu entry behind.

plugin.consumes = ['app'];
plugin.provides = ['tray'];
async function plugin(imports, register) {
    var control = imports.app.host.tray;

    var added = [];

    await register(null, {
        tray: {
            add: function (options) {
                var handle = control.add(options);
                added.push(handle);
                return {
                    remove: function () {
                        var i = added.indexOf(handle);
                        if (i >= 0) added.splice(i, 1);
                        handle.remove();
                    }
                };
            },
            labels: function () { return control.labels(); }
        },
        onDestroy: function () { while (added.length) added.pop().remove(); }
    });
}
module.exports = plugin;
