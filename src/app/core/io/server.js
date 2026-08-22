var serve = require('./serve');

//THE HANDLERS COME OFF AGAIN, and forgetting that is not visible for a while:
//this half is rebuilt on every save, so a listener left behind is a second copy
//answering the next call, then a third. The first symptom is a reply arriving
//twice, long after the save that caused it.

plugin.consumes = ['app', 'Plugin'];
plugin.provides = ['io'];
async function plugin(imports, register) {
    var host = imports.app.host;
    var self = new imports.Plugin('io');

    serve(host.io, host.appPackage);

    self.own(function () {
        host.io.removeAllListeners('connection');
        //the clients come back onto the new handlers, but not by themselves
        //-- either way this is spelled, they are told "io server disconnect"
        //and socket.io-client treats that as final. the page reconnects
        //itself; see the disconnect handler in ./window.js
        host.io.disconnectSockets();
    });

    await register(null, {
        io: host.io,
        onDestroy: self.unload
    });
}
module.exports = plugin;
