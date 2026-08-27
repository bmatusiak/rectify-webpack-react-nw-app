//---------------------------------------------------------------------------
//Ctrl+Shift+D -- photograph this window and write down what it is made of.
//
//THE PAGE'S HALF IS THE KEY AND THE NOTICE, and nothing else. ./main.js has both
//pictures of the window: it holds the window controller, and ../core/bridge
//already carries the page's markup to it. So this half asks and then says what
//happened -- it never reads the DOM itself, and it never writes a file.
//
//SELF-CONTAINED ON PURPOSE. It registers no page, no service and no component,
//and nothing in the app consumes it. Delete the folder and the key stops working
//and nothing else changes.
//
//WHICH IS WHY IT ASKS FOR THINGS RATHER THAN REACHING FOR THEM. It wants a bar
//to say something in, and the first honest way to get one was to draw its own --
//which would make a debugging tool the only thing in the app that knows what a
//notice looks like, and undeletable without a search. ../ui/banner grew a button
//instead, which is an ordinary thing any plugin may want and is the test of
//whether a seam is a seam or a special case.
//
//THE CLIPBOARD IS OFFERED, NEVER TAKEN. The app this idea came from used to take
//it, and it took a quarter of a megabyte of markup silently, in place of whatever
//somebody was carrying between two windows -- for a file that was already on
//disk. What is worth copying is the two paths, which is a button.
//---------------------------------------------------------------------------

plugin.consumes = ['io', 'banner'];
plugin.provides = [];
async function plugin(imports, register) {
    var io = imports.io;
    var banner = imports.banner;

    var ID = 'debug-snapshot';

    function said(text, options) {
        banner.raise(Object.assign({ id: ID, variant: 'info', icon: 'camera', text: text }, options || {}));
    }

    //ONE AT A TIME. Holding the keys down repeats the keydown, and a snapshot is
    //a screenshot and two file writes -- a dozen queued behind one press is a
    //window that stops answering for a while.
    var busy = false;

    function take(trusted) {
        if (busy) return;
        busy = true;

        //WHETHER A PERSON DID IT, SENT AS THE BROWSER SAW IT. ../core/may does
        //the rest: a real press is its own consent and goes straight through, and
        //anything driving the window is asked about instead. This half does not
        //get to decide which of those it is.
        io.emit('snapshot:take', { trusted: !!trusted }, function (out) {
            busy = false;

            if (!out) return said('nothing answered, so nothing was written', { variant: 'warning' });

            if (out.skipped) {
                return said('no snapshot: ' + out.why, { variant: 'warning', dismissible: true });
            }

            var paths = [out.picture, out.markup].filter(Boolean);

            //WHAT WAS NOT WRITTEN IS PART OF THE ANSWER. A minimized window has
            //markup and no picture; a page that never rendered has a picture and
            //no markup. Handing over one path without saying the other half is
            //missing is how somebody concludes the wrong thing from half a pair.
            var missing = [out.pictureSkipped && 'no picture (' + out.pictureSkipped + ')',
                out.markupSkipped && 'no markup (' + out.markupSkipped + ')'].filter(Boolean);

            said(paths.join('   ') + (missing.length ? '   -- ' + missing.join(', ') : ''), {
                variant: missing.length ? 'warning' : 'info',
                dismissible: true,
                does: [{
                    label: paths.length > 1 ? 'Copy both paths' : 'Copy the path',
                    onClick: function () {
                        var text = paths.join(String.fromCharCode(10));

                        Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(text)).then(
                            function () { said('Copied.', { dismissible: true, icon: 'clipboard-check' }); },
                            function (e) {
                                said('the clipboard would not take it: ' + ((e && e.message) || e),
                                    { variant: 'danger', dismissible: true });
                            });
                    }
                }]
            });
        });
    }

    function onKey(e) {
        if (!e.ctrlKey || !e.shiftKey) return;
        if (e.key !== 'D' && e.key !== 'd') return;

        e.preventDefault();

        //`isTrusted` IS THE BROWSER'S OWN AND A PAGE CANNOT FORGE IT. A driven
        //keydown reaches this listener exactly the way a real one does, and this
        //is the only thing that tells them apart -- see ../core/may/deciding.js.
        take(e.isTrusted);
    }

    document.addEventListener('keydown', onKey);

    await register(null, {
        //TAKEN OFF AGAIN ON RELOAD. This half is rebuilt on every save; a
        //listener left on the document means two snapshots per press after one
        //edit and eight after three -- which still "works", which is how it
        //would go unnoticed.
        onDestroy: function () {
            document.removeEventListener('keydown', onKey);
            banner.lower(ID);
        }
    });
}
module.exports = plugin;
