//WHICH SUITES A TARGETED RUN SHOULD TAKE.
//
//Four places ask this -- src/main.js off disk, src/server.js and src/window.js
//through require.context, and tools/selftest.js for the cli -- and all four have
//to agree about what `npm test -- core/ipc` means, or singling out one plugin
//would quietly run a different set in each context.
//
//so the rule lives here and they all ask it. It is deliberately a substring
//rather than anything cleverer: a plugin is named by its folder under src/app
//and the context beside it, so `core/ipc` takes every context of that plugin,
//`core/ipc/main` takes one, and `ipc` takes anything with ipc in its path.

var SEPARATOR = String.fromCharCode(92);//windows paths arrive either way

module.exports = function wanted(name, only) {
    if (!only || only === true) return true;

    var flat = String(name).split(SEPARATOR).join('/');

    if (flat.indexOf('./') === 0) flat = flat.slice(2);//require.context keys
    flat = flat.replace(/\.test\.js$/, '');

    return flat.indexOf(String(only)) >= 0;
};


//AND WHICH PLUGIN A SUITE CAME FROM.
//
//Targeting one plugin used to mean loading only its tests, which meant starting
//the app again to change target. In development they are all loaded all the
//time now -- so the app that is already open can be asked for any one of them,
//and webpack's reload carries an edited test straight into it.
//
//that moves the filtering from load time to run time, and run time needs to
//know which plugin registered which suite. rectify loads plugins one at a time
//and `describe` is called while a plugin is being set up, so wrapping the
//plugin to say its own name first is enough to attribute everything it
//registers.
module.exports.tag = function tag(plugin, name) {
    function wrapped(imports, register, config) {
        if (imports.selftest && imports.selftest.as) imports.selftest.as(name);
        return plugin(imports, register, config);
    }

    wrapped.consumes = plugin.consumes;
    wrapped.provides = plugin.provides;

    //AND IT KEEPS THE NAME. rectify names a plugin after its setup function, so
    //a wrapper called `wrapped` renamed every test plugin in the app to
    //`wrapped` -- in app.plugins, and in the message naming a plugin that could
    //not be resolved. The tag is the folder path, which is a better name than
    //the one it replaced. Found by drawing the graph.
    try { Object.defineProperty(wrapped, 'name', { value: name, configurable: true }); }
    catch (e) { /* frozen Function.name, older engine */ }

    return wrapped;
};
