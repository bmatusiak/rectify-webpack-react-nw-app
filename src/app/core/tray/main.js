//WITHOUT THIS THE WINDOW CANNOT BE ALLOWED TO CLOSE. Closing hides it and
//leaves the node half running, which is only survivable because there is
//somewhere to reopen from -- take the tray away and the same close strands a
//running app with no way back to it, and no way to stop it either.

plugin.consumes = ['app', 'http', 'window', 'lifecycle'];
plugin.provides = ['tray'];
async function plugin(imports, register, config) {
    var { app, http, window: win, lifecycle } = imports;

    var tray = null;//module scope on purpose: a collected Tray takes its icon with it
    var items = [];//what other plugins added, replayed on every rebuild

    //rebuilt whole rather than patched: plugins come and go on every reload, and
    //removing by index is how menus end up with the wrong item on them
    function rebuild() {
        if (!tray) return;//items added before the tray exists are applied when it does

        var menu = new nw.Menu();

        items.forEach(function (entry) { menu.append(new nw.MenuItem(entry.options)); });
        if (items.length) menu.append(new nw.MenuItem({ type: 'separator' }));

        menu.append(new nw.MenuItem({ label: 'Open window', click: function () { win.show(); } }));

        //THE BROWSER VIEWER, SWITCHABLE FROM HERE.
        //
        //A PLAIN ITEM CARRYING ITS OWN STATE, not a checkbox. This was
        //`type: 'checkbox'` with `checked`, which is the obvious way to show one
        //fact with two states -- and the item did not appear in the tray menu at
        //all on windows. It was in the menu object, and the log line below
        //printed its label happily; nw simply did not draw it. So the label says
        //what clicking will do, which needs nothing of the platform and leaves
        //no doubt about which way it is about to go.
        //
        //nw redraws the whole menu on every rebuild, so this is read from
        //`http.serving` at draw time rather than from anything kept here --
        //there is no second copy of the answer to fall out of step.
        //A BUILD WITHOUT THE ABILITY DOES NOT OFFER IT -- the same reasoning as
        //the two Inspect items, which are absent from a package. A menu entry
        //that cannot do its job teaches somebody the app is broken.
        if (http.servable) menu.append(new nw.MenuItem({
            label: http.serving ? 'Stop serving to a browser' : 'Serve to a browser',
            click: function () {
                http.setServing(!http.serving).then(function (on) {
                    console.log(on
                        ? 'serving at ' + http.url
                        : 'the browser viewer is off' + (http.url ? '' : ', and the port with it'));
                }, function (e) {
                    console.error('could not change the browser viewer: ' + (e && e.message));
                    //setServing already flipped its own state back or not; draw
                    //whatever it really is rather than what was asked for
                    rebuild();
                });
            }
        }));

        //and the way to actually open one, while there is something to open
        if (http.serving && http.url) menu.append(new nw.MenuItem({
            label: 'Open in browser',
            click: function () { nw.Shell.openExternal(http.url); }
        }));
        menu.append(new nw.MenuItem({ type: 'separator' }));
        menu.append(new nw.MenuItem({
            label: 'Quit',
            click: function () { lifecycle.shutdown('quit from the tray'); }
        }));

        tray.menu = menu;
        console.log('tray menu: ' + menu.items.map(function (i) { return i.label || '--'; }).join(' | '));
    }

    //REDRAWN WHENEVER THE ANSWER CHANGES, whoever changed it. The tray's own
    //item is not the only way in -- a flag decides it at boot and a plugin could
    //decide it later -- and a menu showing a tick that stopped being true is
    //worse than one with no tick at all.
    var watching = http.onServing(function () { rebuild(); });

    await register(null, {
        tray: {
            get available() { return !!tray; },

            //options are nw.MenuItem's: label, click, type, checked, enabled,
            //tooltip, icon, submenu, key, modifiers. returns a handle, so
            //whoever added an item can take it back when they go
            add: function (options) {
                var entry = { options: options };
                items.push(entry);
                rebuild();
                return {
                    remove: function () {
                        var i = items.indexOf(entry);
                        if (i >= 0) { items.splice(i, 1); rebuild(); }
                    }
                };
            },

            labels: function () { return items.map(function (e) { return e.options.label; }); },

            //called once the server is up, when there is a url for the tooltip
            start: function () {
                try {
                    tray = new nw.Tray({
                        title: app.appPackage.title,
                        //relative on purpose: nw resolves it against the app,
                        //so the same value works from the source tree and from
                        //inside a package. an icon path that does not resolve
                        //is not an error — you get an invisible tray entry.
                        icon: (config.tray && config.tray.icon) || 'icon.png'
                    });
                    tray.tooltip = app.appPackage.title + (http.url ? ' — ' + http.url : '');//see nw.js issue 1903

                    //left click opens the window on windows and linux; on mac the
                    //menu is the only interaction, so the same actions live in it
                    tray.on('click', function () { win.show(); });

                    win.closeShouldHide(true);
                    rebuild();
                } catch (e) {
                    console.error('no tray available, closing the window will quit: ' + (e && e.message || e));
                }
            }
        },
        onDestroy: function () {
            watching();
            try { if (tray) tray.remove(); } catch (e) { /* already gone */ }
            tray = null;
        }
    });
}
module.exports = plugin;
