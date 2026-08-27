var looksLike = require('../log/looks-like');

//THE WINDOW IS NOT THE APP, and everything awkward in this file follows from
//that. Closing it hides it, quitting goes through ../lifecycle, and the handle
//is held here rather than in the reloadable half -- because a save rebuilds
//that half, and a window rebuilt with it is a window that blinks out of
//existence while somebody is reading it.

plugin.consumes = ['app', 'http', 'lifecycle', 'bridge'];
plugin.provides = ['window'];
async function plugin(imports, register, config) {
    var { app, http, lifecycle, bridge } = imports;

    var size = config.window || {};
    var win = null;
    var keepAlive = null;

    //nw has no isVisible, and capturing a window that is not composited either
    //hands back a stale frame or never answers, so the one thing worth knowing
    //is tracked here — every path that hides or shows goes through this plugin
    var hidden = false;

    //WHERE THE WINDOW IS, KEPT THE SAME WAY `hidden` IS. A minimized window
    //has no frame to give, and asking anyway costs fifteen seconds to be told
    //something nw announces the moment it happens.
    var minimized = false;

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

    //pins the window above the others for as long as it takes to photograph
    //it. nw cannot be asked whether it was already pinned, so the undo puts it
    //back the way the config asked for rather than the way it was found.
    function onTop() {
        try {
            //off first. a capture that was killed mid-flight leaves the flag
            //set, and setting it again on a window that already has it does
            //not move anything -- so the window stays where it was, behind
            //whatever is covering it, and the next photograph is of nothing.
            win.setAlwaysOnTop(false);
            win.setAlwaysOnTop(true);
        }
        catch (e) { return function () {}; }//not every platform has it

        return function () {
            try { win.setAlwaysOnTop(!!size.alwaysOnTop); } catch (e) { /* gone */ }
        };
    }

    function open() {
        //a packaged build opens the page out of the package. There is no url,
        //nothing is served, and the window half arrives by way of the bridge --
        //which is also the only thing that can reach this app at all.
        //
        //THE MARKER IS GONE, AND THE BRIDGE REPLACED IT. This used to append
        //?view=app so the page could tell it was the app's own window rather
        //than a browser looking at the same url -- nw 0.114 sends an ordinary
        //chrome user agent, so the side that opened it had to say so. Now main
        //injects `__host` into this window in EVERY build, and a browser cannot
        //produce that: presence of the bridge is the proof, and a better one
        //than a query string anybody could type.
        var page = BUILD_PROD ? bridge.page : http.url;

        if (!page) return console.error('nothing is listening yet');

        nw.Window.open(page, {
            id: 'main',
            width: size.width || 1024,
            height: size.height || 768
        }, function (w) {
            if (!w) return lifecycle.shutdown('the window failed to open');
            win = w;
            hidden = false;

            //INJECTS THE WAY HOME BEFORE THE PAGE'S OWN SCRIPT RUNS, in every
            //build. In a package it carries the window half in with it; in
            //development the page still fetches its own bundle over http so
            //webpack can hot reload it, and the bridge carries only the app's
            //own traffic. Either way this window never speaks socket.io over a
            //port, which is what makes development behave the way a package
            //does when the browser viewer is off.
            bridge.attach(w);

            //listening to `close` at all suppresses nw's default close, which is
            //why the other two paths have to close(true) by hand
            function onWindowClose() {
                if (lifecycle.isShuttingDown || onClose != 'hide') return this.close(true);
                this.hide();
                hidden = true;
                console.log('window hidden, still running. reopen it from the tray.');
            }

            //A WINDOW THAT IS RESTORED BY BEING SHOWN says `restore` too, so
            //these two do not have to know about hide() as well.
            function onMinimize() { minimized = true; }
            function onRestore() { minimized = false; }

            function onWindowClosed() {
                win = null;
                if (onClose != 'hide') lifecycle.shutdown('the window was closed');
            }

            //OURS, REMOVED BY NAME. This used to call removeAllListeners, which
            //was harmless while this plugin was the only one listening to the
            //window -- and stopped being harmless the moment ../bridge started
            //attaching in development too: the first page reload took the
            //bridge's own `closed` handler with it. A window several plugins
            //share is not this one's to clear.
            function attach() {
                //`loaded` can arrive after the window has gone, and then there
                //is nothing to attach to. Reported as "Cannot read properties of
                //null (reading 'on')" from inside nw's own dispatch, which is a
                //long way from the line that caused it.
                if (!win) return;

                try {
                    win.removeListener('close', onWindowClose);
                    win.removeListener('closed', onWindowClosed);
                    win.removeListener('minimize', onMinimize);
                    win.removeListener('restore', onRestore);
                } catch (e) { /* nothing attached yet */ }

                win.on('close', onWindowClose);
                win.on('closed', onWindowClosed);
                win.on('minimize', onMinimize);
                win.on('restore', onRestore);
            }

            attach();
            win.on('loaded', attach);//best effort after a reload, see above
        });
    }

    //---- browser views -------------------------------------------------------
    //
    //A SECOND WINDOW POINTED AT THE SAME URL IS ALREADY A BROWSER.
    //
    //It is a remote page with no `node-remote`, so it has no node, and ../bridge
    //is only ever attached to the app's own window -- so this one has no way
    //home except socket.io. That is precisely the path a real browser takes, and
    //until now nothing exercised it: the only way to get a second viewer was
    //nw.Shell.openExternal, which hands the url to whatever browser the machine
    //happens to have and cannot be driven or closed again.
    //
    //EACH ONE IS STAMPED WITH A SESSION, because otherwise they are only
    //tellable apart by socket.io's own id -- which is opaque, and which changes
    //under them on every reconnect. The name main gave it does not.
    //
    //The page cannot use this to CLAIM anything: which view is the app window is
    //settled by the transport it arrived on, not by what it says. A session only
    //answers "which of these", never "what kind".
    var views = new Map();
    var nextView = 1;

    function openView() {
        if (!http.url) throw new Error('nothing is listening, so there is no page for a view to open');
        if (!http.serving) throw new Error(
            'the browser viewer is off, so a view would not be able to connect. `serve on` first');

        var session = 'browser-' + (nextView++);

        return new Promise(function (resolve, reject) {
            nw.Window.open(http.url + '?session=' + session, {
                id: session,
                width: size.width || 1024,
                height: size.height || 768
            }, function (w) {
                if (!w) return reject(new Error('the view failed to open'));

                //IT IS NOT GIVEN A WAY HOME. No bridge.attach here, deliberately:
                //that is what makes it a browser rather than a second app window.
                w.on('closed', function () { views.delete(session); });
                views.set(session, w);
                resolve(session);
            });
        });
    }

    function closeView(session) {
        var gone = [];

        views.forEach(function (w, id) {
            if (session && id !== session) return;
            try { w.close(true); } catch (e) { /* already gone */ }
            gone.push(id);
        });

        gone.forEach(function (id) { views.delete(id); });
        return gone;
    }

    function markup() {
        var page = bridge.markup();
        if (!page) return null;

        return looksLike.redact(page, 'durable');
    }

    //THE SAME READ AND THE SAME SCRUB, for what the page is made to LOOK like.
    //
    //IT IS SCRUBBED TOO, WHICH LOOKS LIKE OVERKILL AND IS NOT. A stylesheet
    //carries urls -- `background-image: url(...)` -- and this app's own swatches
    //are files on disk, but a rule written at run time by a plugin can carry
    //whatever it was handed. The scrub costs a pass over text that is already
    //being copied to a file, and the alternative is deciding that one of the two
    //halves of a saved page is not worth looking at.
    function styles() {
        var css = bridge.styles();
        if (!css) return null;

        return looksLike.redact(css, 'durable');
    }

    //---- WHAT IS NOT HERE ANY MORE -----------------------------------------
    //
    //`markup()` AND `capture()` ARE CAPABILITIES; WRITING THEM DOWN IS A
    //FEATURE. The commands that put either on disk, the guard in front of them,
    //the key that takes both at once and the notice offering the paths all live
    //in ../../debug-snapshot, which is one folder and deletable in one piece.
    //
    //A DEBUGGING TOOL THAT CANNOT BE DELETED CLEANLY IS THE WRONG KIND OF TOOL,
    //and this plugin is not deletable -- it is the window. So the two are not the
    //same plugin, however close the code looked when both were here.
    await register(null, {
        window: {
            get isOpen() { return !!win; },
            get current() { return win; },

            //WHERE THE WINDOW IS, ASKED RATHER THAN INFERRED. nw has no
            //`isMinimized`, so this is the flag its own `minimize` and
            //`restore` events keep -- and it is what makes "is there a frame to
            //photograph" answerable at once instead of after fifteen seconds.
            get isMinimized() { return minimized; },

            open: open,

            //the browser views this app opened, by the name it gave them
            get views() { return Array.from(views.keys()); },
            openView: openView,
            closeView: closeView,

            show: function () {
                if (win) {
                    try { win.show(); win.focus(); hidden = false; return; }
                    catch (e) { win = null; }//gone out from under us
                }
                open();
            },

            hide: function () { if (win) { win.hide(); hidden = true; } },

            //a photograph of what is on screen. chromium stops drawing a
            //window that nothing can see, so this lifts it to the top of the
            //stack first and puts it back after. z-order, not focus: windows
            //will not let a background process take the foreground, and
            //whatever you are typing into keeps it.
            //
            //nw only draws a frame for a window something can see, and a
            //window nothing can see leaves the callback unanswered forever
            //rather than erroring -- the timeout turns that hang into a
            //sentence somebody can act on.
            //WHAT THE PAGE IS MADE OF, SCRUBBED ON THE WAY OUT.
            //
            //`capture` PHOTOGRAPHS AND THIS READS, and the pair is the point: a
            //class that matches no rule is invisible in the picture and obvious
            //here; a value drawn from the wrong field is the other way round.
            //
            //SCRUBBED, WHICH THE APP THIS CAME FROM DOES NOT DO. Its own header
            //says so plainly -- "this is the one thing in the app that copies
            //the whole screen to a file, and it scrubs nothing" -- and explains
            //that what saves it is React setting `value` as a property while
            //`outerHTML` serialises attributes. That is a property of React and
            //not a rule anybody enforces, and it says nothing at all about text
            //that is simply ON the page.
            //
            //IT SAYS NOTHING AT ALL ABOUT THIS APP. demo/pages/plumbing.js draws
            //an opened secret in a badge -- visible text, not an attribute -- so
            //the luck that covers a form field does not cover us. The `durable`
            //rules from ../log/looks-like.js run over it, the same ones
            //../events uses for a record kept for ever, and for the same reason:
            //this is written to a file that gets attached to bug reports.
            //
            //AND THE REST IS STILL THE CALLER'S PROBLEM. Redaction catches what
            //has a shape. A short, plain, secret string on the screen is in the
            //file, and ./README.md says so rather than letting a scrub imply
            //otherwise.
            markup: markup,
            styles: styles,

            capture: function (options) {
                options = options || {};
                var format = options.format == 'jpeg' ? 'jpeg' : 'png';

                return new Promise(function (resolve, reject) {
                    if (!win) return reject(new Error('the window is not open'));

                    //NOT A FRAME, AND NOT A FAILURE EITHER.
                    //
                    //A minimized window has nothing to photograph, and that is a
                    //fact about where the window is rather than a bug in the app
                    //-- so `npm run drive --shots` going red for it reported a
                    //problem that did not exist, on the one check that can see
                    //the window at all.
                    //
                    //AND IT IS ANSWERED RATHER THAN WAITED FOR. This used to be
                    //the fifteen-second backstop below: ask, wait, and be told
                    //"is it minimized?" as a guess. The window says so itself --
                    //nw fires `minimize` and `restore`, and hide() already set a
                    //flag the same way.
                    if (hidden || minimized) return resolve({
                        skipped: true,
                        why: hidden
                            ? 'the window is hidden, so there is no frame to photograph'
                            : 'the window is minimized, so there is no frame to photograph',
                        format: format
                    });


                    var settled = false;
                    var restore = onTop();

                    var timer = setTimeout(function () {
                        if (settled) return;
                        settled = true;
                        restore();
                        //STILL THE BACKSTOP, and now only for the cases
                        //nothing announced: a window on another desktop, or a
                        //compositor that stopped drawing this one. Minimized
                        //and hidden are answered above, so this no longer has
                        //to guess at them.
                        reject(new Error('the window did not produce a frame within 15s'));
                    }, 15000);

                    function fail(e) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        restore();
                        reject(e);
                    }

                    //a window that was behind another one until a moment ago
                    //has not been drawn yet, and capturePage does not wait for
                    //that -- it hands back whatever the compositor last had,
                    //which is the previous window's contents or nothing at all
                    setTimeout(function () {
                        if (settled) return;
                        take();
                    }, 250);

                    function take() {
                    try {
                        win.capturePage(function (buffer) {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            restore();

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
                    }
                });
            },

            //the tray calls this once there is somewhere to reopen from
            closeShouldHide: function (yes) { onClose = yes ? 'hide' : 'quit'; }
        },
        onDestroy: function () {
            closeView();//a view is this plugin's to clean up, not the user's
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
