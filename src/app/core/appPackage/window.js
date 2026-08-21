//what the app is called, and which version of it this is.
//
//the window has no node in it, so this arrives over the connection along with
//everything else the node side knows -- ./io puts the handshake payload on the
//connection, and this hands it out under its own name. Wanting the app's title
//should not mean consuming a socket.

plugin.consumes = ['io'];
plugin.provides = ['appPackage'];
async function plugin(imports, register) {
    await register(null, {
        appPackage: imports.io.appPackage
    });
}
module.exports = plugin;
