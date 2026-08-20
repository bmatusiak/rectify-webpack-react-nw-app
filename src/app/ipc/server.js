//the control socket, seen from the app's node half.
//
//the listener is owned by ./main.js because it outlives this bundle. commands
//registered here are handed back on reload, so a save does not leave the
//previous build's answers still wired up.

plugin.consumes = ['app'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var control = imports.app.host.ipc;

    //`npm run dev` under plain node has no main half to hand one over
    if (!control) return register(null, { ipc: void 0 });

    var added = [];

    await register(null, {
        ipc: {
            get address() { return control.address; },

            //handle('thing', async function (data) { return ... })
            handle: function (name, fn) {
                var h = control.handle(name, fn);
                added.push(h);
                return {
                    remove: function () {
                        var i = added.indexOf(h);
                        if (i >= 0) added.splice(i, 1);
                        h.remove();
                    }
                };
            },

            commands: function () { return control.commands(); }
        },
        onDestroy: function () { while (added.length) added.pop().remove(); }
    });
}
module.exports = plugin;
