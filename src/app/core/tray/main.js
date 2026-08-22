//the tray icon, and the menu other plugins add to.
//
//this is what makes closing the window survivable: without somewhere to reopen
//from, hiding a window would strand the app with no way back.

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
        //A checkbox rather than two items, because it is one fact with two
        //states. nw redraws the whole menu on every rebuild, so the tick comes
        //from `http.serving` at draw time rather than from anything kept here --
        //there is no second copy of the answer to fall out of step.
        menu.append(new nw.MenuItem({
            type: 'checkbox',
            label: 'Serve to a browser',
            checked: http.serving,
            click: function () {
                //`this` is nw's own item and has already flipped its tick, which
                //would be a lie if the change failed. rebuild() below draws it
                //again from what actually happened.
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
