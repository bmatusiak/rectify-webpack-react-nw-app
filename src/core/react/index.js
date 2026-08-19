plugin.consumes = ['app'];
plugin.provides = ['react'];
async function plugin(imports, register) {
    if (imports.app.isServer) return register(null, { react: void 0 });

    var { createRoot } = require('react-dom/client');

    var react = {};
    react.root = createRoot(document.getElementById('root'));
    await register(null, { react });
}
module.exports = plugin;
