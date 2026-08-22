//OFF THE HOST, NOT OFF DISK -- and the obvious other way is one line shorter.
//`require('../../../../package.json')` reads here, and it puts the WHOLE manifest
//in the server bundle: devDependencies, scripts, the lot, shipped to anyone who
//unpacks the app. The boot picks the six fields it will hand over, so this side
//cannot widen that set even by accident, and never learns where the app lives.
//
//Why it is this plugin registering it rather than ../io is in ./README.md.

plugin.consumes = ['app'];
plugin.provides = ['appPackage'];
async function plugin(imports, register) {
    await register(null, {
        appPackage: imports.app.host.appPackage
    });
}
module.exports = plugin;
