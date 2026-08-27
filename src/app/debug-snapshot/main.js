var fs = require('node:fs');
var path = require('node:path');

//---------------------------------------------------------------------------
//WHAT THE WINDOW LOOKS LIKE, AND WHAT IT IS MADE OF, AT ONE MOMENT.
//
//TWO FILES BECAUSE THEY ANSWER DIFFERENT HALVES OF ONE QUESTION. A class that
//matches no rule is invisible in the picture and obvious in the markup; a value
//drawn from the wrong field is the other way round. CSS has no undefined-name
//error, so a misspelt class is the quietest failure this app has, and the markup
//is the only place it shows.
//
//AND OF THE SAME MOMENT, WHICH IS THE WHOLE REASON THIS PLUGIN EXISTS. Both
//halves were already here -- `capture` in ../core/window and `markup` beside it
//-- and anybody wanting both took two snapshots, of two different instants, then
//compared a pair that describes two windows. The app this idea came from names
//that exactly: "using it directly gets you half the answer and no sign that the
//other half was available".
//
//---- a plugin of its own, and deletable in one piece -----------------------
//
//Nothing outside this folder knows it is here. Delete it and the two commands,
//the key, the banner and the guard all go with it, and nothing else has a line
//to take out. A debugging tool is exactly the kind of thing that should be
//removable without a search.
//
//WHAT STAYS IN ../core/window IS THE CAPABILITY, NOT THE FEATURE: `window.markup()`
//reads and scrubs the page, `window.capture()` photographs it. Those are things a
//window can do. Writing them to disk, guarding that, naming the pair and offering
//the paths is what this owns. The same line the app this came from draws --
//`windowShot` lives in its core and only the pairing is in the deletable folder.
//
//IT IS NOT THE OTHER CAMERA. That app has two: one photographs a page over the
//devtools socket, and one photographs a VIRTUALBOX GUEST'S DESKTOP with
//`VBoxManage controlvm <name> screenshotpng`. Only the first has anything to do
//with this. There is no virtual machine here and nothing to confuse it with, and
//saying so is cheaper than somebody later wondering which one this was.
//
//---- it is main's, and that is not an accident ----------------------------
//
//The node half is rebuilt and re-run on every save. The page worth reading is
//usually the one that failed to render -- and the node half may be exactly what
//failed. So this asks main's own window controller for both halves and writes
//them itself, rather than going through the `capture` command in
//../core/window/server.js, which dies with that bundle.
//
//---- what it writes, and why that needs watching --------------------------
//
//THIS IS THE ONE THING IN THE APP THAT COPIES THE WHOLE SCREEN TO A FILE. The
//markup goes through ../core/log/looks-like.js on the `durable` rules -- the same
//ones ../core/events uses for a record kept for ever -- so what has a shape is
//redacted. THE PICTURE HAS NO SUCH LUCK: it is what the screen looks like. A
//secret on screen is a secret in the png unless it is a password field.
//
//So it is guarded, and `shots/` is where both halves land because it is already
//gitignored. They are not protected, only unpublished: they sit in the working
//tree in cleartext and are the right thing to delete after reading.
//---------------------------------------------------------------------------

plugin.consumes = ['app', 'ipc', 'window', 'bridge', 'may', 'log'];
plugin.provides = [];
async function plugin(imports, register) {
    var { app, ipc, bridge, may } = imports;
    var win = imports.window;
    var say = imports.log.on('snapshot');

    function shots() { return path.join(app.root, 'shots'); }

    //TWO FILES THAT SHARE A NAME. A pair from one moment that does not is a pair
    //somebody has to match up by timestamp, at the point they are already
    //comparing two things.
    function stamp() {
        var d = new Date();
        function two(n) { return String(n).padStart(2, '0'); }

        return 'snapshot-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate())
            + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
    }

    //COPYING THE SCREEN TO A FILE IS SOMEBODY'S DECISION TO MAKE, and it is one
    //capability rather than two: a person answering about the markup and then
    //again about the picture is being asked twice about one act.
    //
    //IT IS DECLARED HERE, so deleting this folder takes the guard with it. What
    //that means is worth being plain about: `capture` in ../core/window is not
    //guarded and never was, so the picture on its own stays reachable either
    //way. What this guards is writing the SCREEN down, which is the pair.
    var undeclare = may.declare('snapshot', {
        about: 'Write what is on the screen to a file -- a picture of the window, and what the page '
            + 'is made of. Both hold whatever was on screen.'
    });

    //---- the two halves ----------------------------------------------------

    function markup() {
        //`bridge.attached` RATHER THAN A TRY. There being no page is an ordinary
        //state -- the window is closed, or has not finished loading -- and it is
        //a different answer from the page failing to give up its markup.
        return bridge.attached ? win.markup() : null;
    }

    async function picture(where) {
        var shot;

        try { shot = await win.capture({ format: 'png' }); }
        catch (e) { return { skipped: true, why: (e && e.message) || String(e) }; }

        //A MINIMIZED OR HIDDEN WINDOW HAS NO FRAME, and that is a fact about
        //where the window is rather than a failure. ../core/window answers it
        //instead of waiting fifteen seconds to guess.
        if (!shot || shot.skipped) return { skipped: true, why: (shot && shot.why) || 'no frame' };

        fs.mkdirSync(path.dirname(where), { recursive: true });
        fs.writeFileSync(where, shot.buffer);

        return { path: where, bytes: shot.buffer.length, width: shot.width, height: shot.height };
    }

    //---- and both at once ---------------------------------------------------
    //
    //HALF AN ANSWER IS STILL AN ANSWER, and it is not an error. A window that is
    //minimized has markup and no picture; a window whose page never rendered has
    //a picture and no markup. Refusing both because one is missing would fail
    //hardest in exactly the cases somebody is reaching for this.
    async function snapshot(data, from) {
        var said = await may('snapshot', { from: from });
        if (!said.allowed) return { skipped: true, why: said.why };

        var name = (data && data.path) ? String(data.path).replace(/\.(png|html)$/i, '') : path.join(shots(), stamp());

        var out = { name: name };

        var page = markup();

        if (page) {
            try {
                fs.mkdirSync(path.dirname(name + '.html'), { recursive: true });
                fs.writeFileSync(name + '.html', page);

                out.markup = name + '.html';
                out.bytes = page.length;
                out.redacted = page.indexOf('[redacted]') >= 0;
            } catch (e) {
                out.markupSkipped = 'it could not be written: ' + ((e && e.message) || e);
            }
        } else {
            out.markupSkipped = 'there is no page to read';
        }

        var shot = await picture(name + '.png');

        if (shot.skipped) out.pictureSkipped = shot.why;
        else { out.picture = shot.path; out.pixels = shot.width ? shot.width + 'x' + shot.height : null; }

        //SAID IN THE APP'S OWN LOG, and only when something was written. A line
        //saying a snapshot happened when neither half did is the kind of record
        //that makes the log worth less than no log.
        if (out.markup || out.picture) {
            say.good('wrote ' + [out.markup && 'the markup', out.picture && 'a picture']
                .filter(Boolean).join(' and ') + ' to ' + path.basename(name) + '.*');
        }

        //NEITHER HALF IS A SKIP, NOT A HALF-SUCCESS. Somebody has to be told
        //nothing is on disk rather than handed two paths to files that are not
        //there.
        if (!out.markup && !out.picture) {
            return { skipped: true, why: out.markupSkipped + ', and ' + out.pictureSkipped };
        }

        return out;
    }

    //---- the commands -------------------------------------------------------

    var commands = [
        ipc.handle('snapshot', snapshot),

        //THE MARKUP ON ITS OWN IS STILL WORTH HAVING, and it is the half that
        //works when the window is not on screen. It is the same guard, because
        //it is the same act -- writing what is on the screen down.
        ipc.handle('markup', async function (data, from) {
            var said = await may('snapshot', { from: from });
            if (!said.allowed) return { skipped: true, why: said.why };

            var page = markup();
            if (!page) return { skipped: true, why: 'there is no window to read' };

            //BESIDE THE PICTURES, NOT IN THE PROJECT ROOT.
            //
            //It defaulted to the root once, and the first file it wrote there
            //had this app's own demo secret in it -- one `git add -A` from being
            //committed. `shots/` is already gitignored, which is the same
            //decision made once rather than twice.
            var where = (data && data.path) || path.join(shots(), 'markup.html');

            try {
                fs.mkdirSync(path.dirname(where), { recursive: true });
                fs.writeFileSync(where, page);
            } catch (e) {
                return { skipped: true, why: 'it could not be written: ' + ((e && e.message) || e) };
            }

            return { path: where, bytes: page.length, redacted: page.indexOf('[redacted]') >= 0 };
        })
    ];

    //---- and the key in the window -----------------------------------------
    //
    //THE PRESS TRAVELS WITH IT, the same as everything else that goes through
    //../core/may. A person holding ctrl+shift+D gets their snapshot without
    //being asked to confirm what they just did; the same message arriving from
    //something driving the window raises the question instead. One rule, and
    //this plugin does not get to have its own version of it.
    bridge.io.on('connection', function (socket) {
        socket.on('snapshot:take', async function (said, ack) {
            if (typeof ack != 'function') return;

            var out = await snapshot(said || {}, { window: true, trusted: !!(said && said.trusted) });
            ack(out);
        });
    });

    await register(null, {
        onDestroy: function () {
            commands.forEach(function (one) { one.remove(); });
            undeclare();
        }
    });
}
module.exports = plugin;
