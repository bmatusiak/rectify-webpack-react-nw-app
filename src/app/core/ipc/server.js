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

            commands: function () { return control.commands(); },

            //CALLING A COMMAND WITHOUT A SOCKET. main.js has had this since the
            //selftest collector needed it; this half never passed it through,
            //so anything here that wanted an answer from another plugin's
            //command had to open a connection to the app it is already inside.
            //
            //It is the same handler table the cli reaches over the wire, which
            //is what makes `capture` one implementation rather than two.
            invoke: function (name, data) { return control.invoke(name, data); }
        },
        onDestroy: function () { while (added.length) added.pop().remove(); }
    });
}
module.exports = plugin;
