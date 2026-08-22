//THE LISTENER IS ./main.js's, NOT THIS FILE'S, and it is the reload that
//decides it. This bundle is torn down and rebuilt on every save; a listener
//owned here would be rebound each time -- or worse, not unbound, leaving the
//previous build's answers still wired up and two handlers racing to reply.
//Commands registered here are handed back when this half goes.

plugin.consumes = ['app'];
plugin.provides = ['ipc'];
async function plugin(imports, register) {
    var control = imports.app.host.ipc;

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
