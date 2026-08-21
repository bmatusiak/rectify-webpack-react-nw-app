//what the app is called, and which version of it this is.
//
//it used to be registered by ./io alongside the socket, because that is how it
//arrives in the window -- but on this side it comes straight off the host, and
//nothing about a name and a version has anything to do with a socket. Anything
//wanting it had to consume 'io' to get it.

plugin.consumes = ['app'];
plugin.provides = ['appPackage'];
async function plugin(imports, register) {
    await register(null, {
        appPackage: imports.app.host.appPackage
    });
}
module.exports = plugin;
