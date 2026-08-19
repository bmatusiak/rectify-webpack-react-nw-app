//the nw.js side of the app, as a service.
//
//the window and the tray belong to main.js on purpose: they have to outlive
//the server bundle, which is torn down and rebuilt on every reload. this
//plugin wraps that controller so app plugins can reach it the usual way, and
//takes back whatever it added when the reload tears it down.

plugin.consumes = ['app'];
plugin.provides = ['nw'];
async function plugin(imports, register) {
    var { app } = imports;

    //the window has no node in it, so there is nothing to reach from there
    if (!app.isServer) return register(null, { nw: void 0 });

    //`npm run dev` runs the same bundle under plain node, with no nw at all
    if (!app.nw) return register(null, { nw: void 0 });

    var control = app.nw;
    var added = [];

    var api = {
        get url() { return control.url; },
        get hasWindow() { return control.hasWindow; },

        open: function () { control.open(); },
        hide: function () { control.hide(); },
        openInBrowser: function () { control.openInBrowser(); },
        quit: function (reason) { control.quit(reason); },

        tray: {
            //options are nw.MenuItem's: label, click, type, checked, enabled,
            //tooltip, icon, submenu, key, modifiers
            add: function (options) {
                var handle = control.tray.add(options);
                added.push(handle);
                return {
                    remove: function () {
                        var i = added.indexOf(handle);
                        if (i >= 0) added.splice(i, 1);
                        handle.remove();
                    }
                };
            },
            labels: function () { return control.tray.labels(); }
        }
    };

    await register(null, {
        nw: api,

        //a reload rebuilds this plugin, so the items it put on the menu go with
        //it — otherwise every save leaves another copy behind
        onDestroy: function () {
            while (added.length) added.pop().remove();
        }
    });
}
module.exports = plugin;
