//the nw.js window. it is a view onto a server that outlives it.

plugin.consumes = ['app', 'server', 'lifecycle'];
plugin.provides = ['window'];
async function plugin(imports, register, config) {
    var { app, server, lifecycle } = imports;

    //`npm run dev` runs this same list under plain node, where there is no
    //window to open and nothing to open it with
    if (!app.isNw) return register(null, { window: void 0 });

    var size = config.window || {};
    var win = null;
    var keepAlive = null;

    //nw quits when the last window closes. intercepting close and hiding is the
    //tidy way to avoid that, but the listener does not survive a page reload --
    //and the client half full-reloads on any change it cannot hot swap, so the
    //tidy way stops working the first time you edit anything. this window is
    //never shown and never closed, so the count never reaches zero and the app
    //survives either way: hidden if the interception held, closed and reopened
    //fresh if it did not.
    function openKeepAlive() {
        nw.Window.open('about:blank', { id: 'keepalive', show: false }, function (w) {
            keepAlive = w;
        });
    }

    //'quit' until something says otherwise. the tray plugin switches it to
    //'hide' if it manages to create a tray, since without one there would be
    //no way back to a hidden window
    var onClose = 'quit';

    function open() {
        if (!server.url) return console.error('nothing is listening yet');

        nw.Window.open(server.url, {
            id: 'main',
            width: size.width || 1024,
            height: size.height || 768
        }, function (w) {
            if (!w) return lifecycle.shutdown('the window failed to open');
            win = w;

            //nw quits when the last window closes, tray or not, so with a tray
            //the close is intercepted and the window only hidden: the node half
            //keeps running and reopening is instant, with the page state intact.
            //listening to `close` at all suppresses nw's default close, which is
            //why the other two paths have to close(true) by hand.
            //
            //re-attached on every load, because a page reload silently drops
            //the close listener while leaving `loaded` firing -- and the client
            //half full-reloads on any change it cannot hot swap, so without
            //this the first edit you make turns close back into quit.
            function attachCloseHandlers() {
                try { win.removeAllListeners('close'); win.removeAllListeners('closed'); }
                catch (e) { /* nothing attached yet */ }

                win.on('close', function () {
                    if (lifecycle.isShuttingDown || onClose != 'hide') return this.close(true);
                    this.hide();
                    console.log('window hidden, still running. reopen it from the tray.');
                });

                win.on('closed', function () {
                    win = null;
                    if (onClose != 'hide') lifecycle.shutdown('the window was closed');
                });
            }

            attachCloseHandlers();
            win.on('loaded', attachCloseHandlers);
        });
    }

    openKeepAlive();

    var api = {
        get isOpen() { return !!win; },
        get current() { return win; },

        open: open,

        show: function () {
            if (win) {
                try { win.show(); win.focus(); return; }
                catch (e) { win = null; }//gone out from under us
            }
            open();
        },

        hide: function () { if (win) win.hide(); },

        //the tray plugin calls this once it has somewhere to reopen from
        closeShouldHide: function (yes) { onClose = yes ? 'hide' : 'quit'; }
    };

    await register(null, {
        window: api,
        onDestroy: function () {
            try { if (keepAlive) keepAlive.close(true); } catch (e) { /* already gone */ }
            keepAlive = null;
        }
    });
}
module.exports = plugin;
