//the nw.js window. it is a view onto a server that outlives it.

plugin.consumes = ['app', 'http', 'lifecycle'];
plugin.provides = ['window'];
async function plugin(imports, register, config) {
    var { app, http, lifecycle } = imports;

    var size = config.window || {};
    var win = null;
    var keepAlive = null;

    //nw has no isVisible, and capturing a window that is not composited either
    //hands back a stale frame or never answers, so the one thing worth knowing
    //is tracked here — every path that hides or shows goes through this plugin
    var hidden = false;

    //'quit' until something says otherwise. the tray switches it to 'hide' if
    //it manages to create an icon, since without one there would be no way back
    //to a hidden window.
    var onClose = 'quit';

    //nw quits when the last window closes. intercepting close and hiding is the
    //tidy way around that, but the listener does not survive a page reload --
    //and the window half full-reloads on any change it cannot hot swap, so the
    //tidy way stops working the first time you edit anything. this window is
    //never shown and never closed, so the count never reaches zero and the app
    //survives either way: hidden if the interception held, closed and reopened
    //fresh if it did not.
    nw.Window.open('about:blank', { id: 'keepalive', show: false }, function (w) {
        keepAlive = w;
    });

    function open() {
        if (!http.url) return console.error('nothing is listening yet');

        //?view=app marks this as the app's own window rather than a browser
        //looking at the same url. nothing in the page can tell the difference
        //on its own -- nw 0.114 sends an ordinary chrome user agent, and the
        //window deliberately has no node in it -- so the side that opened it
        //is the side that has to say so. src/app/remote reads it back.
        nw.Window.open(http.url + '?view=app', {
            id: 'main',
            width: size.width || 1024,
            height: size.height || 768
        }, function (w) {
            if (!w) return lifecycle.shutdown('the window failed to open');
            win = w;
            hidden = false;

            //listening to `close` at all suppresses nw's default close, which is
            //why the other two paths have to close(true) by hand
            function attach() {
                try { win.removeAllListeners('close'); win.removeAllListeners('closed'); }
                catch (e) { /* nothing attached yet */ }

                win.on('close', function () {
                    if (lifecycle.isShuttingDown || onClose != 'hide') return this.close(true);
                    this.hide();
                    hidden = true;
                    console.log('window hidden, still running. reopen it from the tray.');
                });

                win.on('closed', function () {
                    win = null;
                    if (onClose != 'hide') lifecycle.shutdown('the window was closed');
                });
            }

            attach();
            win.on('loaded', attach);//best effort after a reload, see above
        });
    }

    await register(null, {
        window: {
            get isOpen() { return !!win; },
            get current() { return win; },

            open: open,

            show: function () {
                if (win) {
                    try { win.show(); win.focus(); hidden = false; return; }
                    catch (e) { win = null; }//gone out from under us
                }
                open();
            },

            hide: function () { if (win) { win.hide(); hidden = true; } },

            //a photograph of what is on screen. nw only draws a frame for a
            //window the compositor is showing, so a hidden one can leave the
            //callback unanswered forever — the timeout turns that hang into a
            //sentence somebody can act on.
            capture: function (options) {
                options = options || {};
                var format = options.format == 'jpeg' ? 'jpeg' : 'png';

                return new Promise(function (resolve, reject) {
                    if (!win) return reject(new Error('the window is not open'));

                    //asking anyway costs fifteen seconds to be told the same
                    if (hidden) return reject(new Error(
                        'the window is hidden, so there is no frame to photograph. open it first'));

                    var settled = false;
                    var timer = setTimeout(function () {
                        if (settled) return;
                        settled = true;
                        //still the backstop: minimized, or off on another
                        //desktop, looks no different from here
                        reject(new Error('the window did not produce a frame within 15s. is it minimized?'));
                    }, 15000);

                    function fail(e) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        reject(e);
                    }

                    try {
                        win.capturePage(function (buffer) {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);

                            //nw hands back whatever it has, and an empty buffer
                            //is not an error to it
                            if (!buffer || !buffer.length) return reject(new Error('the capture came back empty'));

                            var size = measure(buffer, format);
                            resolve({
                                format: format,
                                buffer: buffer,
                                width: size && size.width,
                                height: size && size.height
                            });
                        }, { format: format, datatype: 'buffer' });
                    } catch (e) { fail(e); }
                });
            },

            //the tray calls this once there is somewhere to reopen from
            closeShouldHide: function (yes) { onClose = yes ? 'hide' : 'quit'; }
        },
        onDestroy: function () {
            try { if (keepAlive) keepAlive.close(true); } catch (e) { /* already gone */ }
            keepAlive = null;
        }
    });
}
module.exports = plugin;
//the one piece of this file that is arithmetic rather than nw, so it is the
//one piece worth testing without one
module.exports.measure = measure;

//what was actually captured, read out of the file's own header rather than
//from the window: a screen at 2x hands back an image twice the size it asked
//for, and the number worth printing is the one in the file.
function measure(buffer, format) {
    try {
        if (format == 'png') {
            //8 bytes of signature, then the IHDR chunk's length and name
            if (buffer.length < 24) return null;
            return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }

        //jpeg keeps it in whichever start-of-frame marker it happens to use
        var i = 2;
        while (i + 9 < buffer.length) {
            if (buffer[i] != 0xFF) { i++; continue; }
            var marker = buffer[i + 1];
            if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC)
                return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
            if (marker == 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
            i += 2 + buffer.readUInt16BE(i + 2);
        }
        return null;
    } catch (e) { return null; }//a header we do not recognise is not a failure
}
