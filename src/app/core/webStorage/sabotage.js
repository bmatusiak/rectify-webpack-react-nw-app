//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//NOTHING AUTHORITATIVE LIVES HERE, and that is what makes the failures quiet
//rather than harmless. Both stores are the browser's, so what is in them is the
//tab you had open and the swatch you picked -- lose it and nobody files a bug,
//they just set it again and wonder why.
//
//A STORE THAT SILENTLY STOPS SAVING IS THE SHAPE TO WATCH FOR. Reads come from
//memory, so everything works perfectly until the window is closed -- which is
//exactly when nobody is looking.
//
//THE TWO STORES ARE ONE FACTORY, so most of these break both at once. That is
//the argument for bundling them, seen from the other side: they cannot differ.

module.exports = [
    //---- writing through ---------------------------------------------------
    {
        //ASSIGNMENT WRITES BACK, AND THAT IS THE WHOLE INTERFACE -- there is no
        //`save()` to remember. Take it out and every read still answers from
        //memory: the app behaves, the swatch sticks, and it is all gone at the
        //next reload.
        what: 'assignment stops writing through, so everything is lost on reload',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: '                            $typeStore_mem[typeStore_property] = newValue;\n                            $typeStore_obj.save();',
        replace: '                            $typeStore_mem[typeStore_property] = newValue;'
    },
    {
        //AND THE WRITER ITSELF. `save` is what every setter calls, so this is
        //the same loss one layer down -- and it looks even more like working
        //code, because the method is still there.
        what: 'saving does nothing at all',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: '                    setStored(typeStore_name, $typeStore_mem);',
        replace: '                    /* sabotaged */'
    },
    {
        //A DEFAULT IS WRITTEN DOWN THE FIRST TIME, so the store on disk is a
        //complete picture rather than a partial one -- and a value read back
        //later is the same whether or not anything ever assigned to it.
        what: 'a default is never written, so the store is only half there',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: "                    if (typeof $typeStore_obj[typeStore_property] === 'undefined') {\n                        $typeStore_obj[typeStore_property] = default_value;",
        replace: "                    if (false) {\n                        $typeStore_obj[typeStore_property] = default_value;"
    },

    //---- and which store is which ------------------------------------------
    {
        //TWO STORES, AND THEY ARE NOT INTERCHANGEABLE. `session` is the tab and
        //dies with it; `preferences` outlives the window. Swapping them means a
        //swatch somebody picked is forgotten on every reload, and the page they
        //had open comes back weeks later.
        what: 'the two stores are wired to each other backwards',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: '        session: typeStorage(sessionStorage),\n        preferences: typeStorage(localStorage),',
        replace: '        session: typeStorage(localStorage),\n        preferences: typeStorage(sessionStorage),'
    },

    //---- and the one that is not about storage at all ----------------------
    {
        //`save` IS THIS OBJECT'S OWN WRITER, so a default of that name cannot be
        //defined without shadowing it. Skipping it in SILENCE is how a checkout
        //field called `save` ended up handing react a function as `checked`, and
        //complaining into a console nobody was reading.
        //
        //THE REFUSAL IS NOT THE POINT -- the SAYING is. A field quietly dropped
        //is a field somebody spends an afternoon looking for.
        what: 'a field called save is dropped without a word',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: "                    console.warn('storage: the ' + typeStore_name +\n                        ' store has a field named save, which is its own method. Ignored.');",
        replace: '                    /* sabotaged */'
    },
    {
        //AND THE SKIP ITSELF. Without it the property is defined over the top of
        //the writer, so `save` becomes a value and every setter in the store
        //throws the first time it is used.
        what: 'a field called save shadows the writer instead of being refused',
        file: 'window.js',
        check: 'core/webStorage/window',
        find: "                if (i === 'save') {",
        replace: '                if (false) {'
    }
];
