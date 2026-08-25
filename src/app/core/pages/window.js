var React = require('react');
var { useState, useEffect } = React;

//---------------------------------------------------------------------------
//THE PAGES THE APP HAS, AND THE ONE PLACE ANYTHING CAN ADD ONE.
//
//It was a literal array -- ../../demo/pages/index.js, "adding a page is a line
//there and a file beside it" -- which is true and was the wrong shape for
//everything except the demo. A plugin in ../../../app_plugins could not add a
//page at all without editing the demo, and editing the app is exactly what a
//separable tree must not have to do. A whole feature could be dropped in beside
//the app, tested against the real graph and driven over ipc, and still have
//nowhere to appear.
//
//SO THE LIST IS A SERVICE AND THE SHELL IS NOT. Anything with a `window.js` can
//say `consumes: ['pages']` and add one; the demo renders whatever is registered
//rather than what it can see on disk. Same shape as ../../ui/banner, ../tray and
//../../../app_plugins/mcp: a registry others add to, and one thing somewhere
//that draws the result.
//
//WHY core AND NOT ui. Nothing here renders -- there is no markup in this file
//and it consumes no theme. It is the app's own table of contents, in the same
//sense ../tray owns a menu that others add items to, and the plugins under ui/
//are surfaces. A shell that is not the demo's would replace the drawing and keep
//this.
//
//DELETING THE DEMO LEAVES THIS WORKING AND NOTHING DRAWING IT, which is the
//honest outcome rather than a bug: the registry is the contract, the sidebar is
//the demo's. A scaffold that is being turned into a real app replaces the shell
//and every page registered against it still arrives.
//---------------------------------------------------------------------------

plugin.consumes = [];
plugin.provides = ['pages'];
async function plugin(imports, register) {
    var registered = [];
    var watchers = [];

    function announce() {
        var now = list();
        watchers.slice().forEach(function (fn) {
            try { fn(now); }
            catch (e) { console.error('a pages watcher threw', (e && e.stack) || e); }
        });
    }

    //IN `order`, THEN IN THE ORDER THEY ARRIVED. Sorting on one number alone
    //would make the sidebar depend on plugin load order, which falls out of the
    //dependency graph and changes when an unrelated plugin gains a `consumes`.
    //A page moving because something else grew a dependency is the kind of thing
    //nobody would ever think to look for.
    function list() {
        return registered.slice().sort(function (a, b) {
            return (a.order - b.order) || (a.at - b.at);
        });
    }

    var arrived = 0;

    //ADDING THE SAME id TWICE REPLACES IT rather than stacking a second copy.
    //The window bundle is rebuilt and re-run on every save, so a plugin that
    //registers a page on load would otherwise have three of them in the sidebar
    //by lunchtime -- the same reason ../../ui/banner replaces by id.
    function add(spec) {
        spec = spec || {};

        if (!spec.id) throw new Error('a page needs an id');
        if (typeof spec.Page != 'function') throw new Error('the page "' + spec.id + '" has nothing to render');

        var entry = {
            id: spec.id,
            label: spec.label || spec.id,
            icon: spec.icon,
            Page: spec.Page,

            //100 rather than 0 so a page that does not care lands AFTER the ones
            //that do. The app's own pages number themselves; a plugin adding one
            //means "put it with the others", not "put it first".
            order: spec.order === undefined ? 100 : spec.order,
            at: arrived++
        };

        var was = registered.findIndex(function (one) { return one.id === entry.id; });
        if (was >= 0) registered[was] = entry;
        else registered.push(entry);

        announce();

        //A HANDLE, NOT A BOOLEAN, because the caller is usually a plugin whose
        //teardown wants to undo exactly what it did -- `self.own(added.remove)`
        //and nothing to name twice.
        return {
            id: entry.id,
            remove: function () { return remove(entry.id); }
        };
    }

    function remove(id) {
        var before = registered.length;
        registered = registered.filter(function (one) { return one.id !== id; });

        if (registered.length !== before) announce();
        return registered.length !== before;
    }

    function onChange(fn) {
        watchers.push(fn);
        return function () {
            var at = watchers.indexOf(fn);
            if (at >= 0) watchers.splice(at, 1);
        };
    }

    //THE HOOK IS PART OF THE SERVICE, so a shell does not have to know that the
    //list can change under it. Every shell would otherwise write the same
    //useState/useEffect pair, and the one that forgot would draw a sidebar that
    //never noticed a page being added.
    function usePages() {
        var [items, setItems] = useState(list);

        useEffect(function () {
            setItems(list());
            return onChange(setItems);
        }, []);

        return items;
    }

    await register(null, {
        pages: {
            add: add,
            remove: remove,
            onChange: onChange,
            usePages: usePages,

            //read rather than held, because a caller asking twice should get
            //what is registered now and not what was registered when it asked
            get list() { return list(); }
        }
    });
}
module.exports = plugin;
