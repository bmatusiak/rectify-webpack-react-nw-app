var serve = require('./serve');

//the handlers. reloaded on every save, so they come off again in onDestroy —
//otherwise each reload would leave another copy listening.

plugin.consumes = ['app', 'Plugin'];
plugin.provides = ['io', 'appPackage'];
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
        appPackage: host.appPackage,
        onDestroy: self.unload
    });
}
module.exports = plugin;
