var harness = require('@bmatusiak/rectify/harness.js');

//and the terminal's. The cli context is not part of the running app -- it is a
//separate short-lived process -- so nothing here answers over a socket. What
//builds this graph runs the suites itself: tools/drive.js, which already builds
//a cli graph to talk to the app with.

plugin.consumes = [];
plugin.provides = ['selftest'];
async function plugin(imports, register) {
    await register(null, { selftest: harness.create() });
}
module.exports = plugin;
