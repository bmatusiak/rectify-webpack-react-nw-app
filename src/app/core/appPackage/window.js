//THERE IS NO NODE IN THE WINDOW, so the obvious other way is not available at
//all: `require('../../../../package.json')` compiles, and then webpack inlines the
//manifest into the page bundle -- the whole of it, devDependencies included,
//shipped to a browser. What arrives instead is the six fields the node side
//already picked, riding in on ../io's handshake and kept on the connection.
//
//Taking it off the connection HERE rather than letting callers read
//`io.appPackage` is what keeps a title from costing a socket -- see ./README.md.

plugin.consumes = ['io'];
plugin.provides = ['appPackage'];
async function plugin(imports, register) {
    await register(null, {
        appPackage: imports.io.appPackage
    });
}
module.exports = plugin;
