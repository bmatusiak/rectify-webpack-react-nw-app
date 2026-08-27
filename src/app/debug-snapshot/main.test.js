var fs = require('node:fs');
var path = require('node:path');

//BOTH HALVES OF ONE MOMENT, IN THE APP THAT TAKES THEM.
//
//WHAT NEEDS THE REAL APP IS THE PAIRING. That the two files share a name, that
//they are of the same instant, that a missing half is named rather than silently
//dropped, and that this is guarded at all -- none of which can be asked of a
//module, because all of it is about a real window and a real registry.
//
//EVERY FILE THESE WRITE GOES IN THE SCRATCH FOLDER AND IS TAKEN AWAY AGAIN. An
//earlier version of this suite wrote into `shots/`, which is where a person's
//own snapshots are, and left `snapshot-*.png` behind on every run.

plugin.consumes = ['selftest', 'ipc', 'may', 'window', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { ipc, may, app } = imports;
    var win = imports.window;

    var here = path.join(app.root, 'shots', 'probe-snapshot-' + process.pid);

    //A PERSON AT THE WINDOW, WHICH IS WHAT THE COMMAND WOULD SEE IF SOMEBODY
    //PRESSED THE KEY. Calling it with nothing would make it an outside caller
    //and raise a dialog nobody is there to answer, and this suite would sit for
    //two minutes waiting -- which is how ../core/may/window.test.js learned the
    //same thing about itself.
    var asPerson = { window: true, trusted: true };

    //ANYTHING THAT STARTS WITH THE PROBE NAME, not two endings named here.
    //
    //IT WAS `['.png', '.html']`, AND THAT IS NOT CLEANUP. The sabotage that
    //makes the two halves stop sharing a name writes `<probe>-picture.png` --
    //so the run that PROVES the naming is checked is exactly the run whose
    //litter the cleanup cannot see, and two of them were left in the user's
    //`shots/` folder. A cleanup coupled to the name the code is supposed to
    //produce fails in every case where the code is wrong, which is the only
    //case that matters.
    function clean() {
        var folder = path.dirname(here);
        var mine = path.basename(here);

        try {
            fs.readdirSync(folder).forEach(function (name) {
                if (name.indexOf(mine) !== 0) return;
                try { fs.unlinkSync(path.join(folder, name)); } catch (e) { /* gone already */ }
            });
        } catch (e) { /* the folder has never been written to */ }
    }

    describe('a snapshot', function () {

        //THE CAPABILITY IS THIS PLUGIN'S, so deleting the folder takes the guard
        //with it. If this fails, either the declare moved or somebody renamed it
        //-- and a guard nobody declares is a command with nothing in front of it.
        it('is somebody\'s decision to make', function () {
            assert.equal(may.asks('snapshot'), true, 'writing the screen down is not guarded');
        });

        //THE WHOLE REASON THIS PLUGIN EXISTS. Two files of one moment, sharing a
        //name -- a pair that does not is a pair somebody has to match up by
        //timestamp, at the point they are already comparing two things.
        it('writes both halves under one name', async function () {
            clean();

            try {
                var out = await ipc.invoke('snapshot', { path: here }, asPerson);

                assert.ok(!out.skipped, 'nothing was written: ' + out.why);

                //THE MARKUP IS THE HALF THAT MUST BE THERE. The picture depends
                //on the window being on screen, and a suite running on a machine
                //with the window minimized is an ordinary state -- see below.
                assert.equal(out.markup, here + '.html', 'the markup is not named after the pair');
                assert.ok(fs.existsSync(here + '.html'), 'the markup file is not on disk');

                if (out.picture) {
                    assert.equal(out.picture, here + '.png', 'the picture is not named after the pair');
                    assert.ok(fs.existsSync(here + '.png'), 'the picture file is not on disk');
                } else {
                    //NOT A PASS BY DEFAULT. If there is no picture it has to say
                    //why -- silence here would let a broken camera look like a
                    //minimized window for ever.
                    assert.ok(out.pictureSkipped, 'there is no picture and no reason given');
                }
            } finally { clean(); }
        });

        //HALF AN ANSWER IS STILL AN ANSWER. Refusing both because one failed
        //fails hardest in exactly the case somebody reaches for this.
        //
        //IT HIDES THE WINDOW TO GET THERE, and that is the whole point of the
        //test rather than an inconvenience. The first version asked for a
        //snapshot and checked the explanation ONLY IF a half was missing -- and
        //in a running app neither ever is, so it asserted nothing at all.
        //
        //ITS OWN SABOTAGE FOUND THAT BY SURVIVING: `out.pictureSkipped` was
        //deleted outright and this still passed, because the line never ran.
        //A test that cannot reach the state it is about is not a weak test, it
        //is an absent one -- and the fix is to reach the state, not to add
        //another assertion beside it.
        //
        //A HIDDEN WINDOW IS THE HONEST WAY IN. ../core/window answers `capture`
        //on a hidden window with a skip and a reason rather than waiting fifteen
        //seconds for a frame that is never drawn, so this is the real path.
        it('names the half that was not written, rather than dropping it', async function () {
            clean();
            win.hide();

            try {
                var out = await ipc.invoke('snapshot', { path: here }, asPerson);

                //THE MARKUP SURVIVES A WINDOW NOBODY CAN SEE, which is half of
                //why the two are worth taking together at all.
                assert.ok(out.markup, 'the markup did not survive a hidden window');
                assert.ok(!out.picture, 'a hidden window somehow produced a picture');

                assert.ok(out.pictureSkipped, 'there is no picture and nothing said why');
                assert.ok(out.pictureSkipped.indexOf('hidden') >= 0, out.pictureSkipped);
            } finally {
                //PUT BACK WHATEVER HAPPENS. A suite that leaves the window
                //hidden takes every check after it down with it, and the app
                //looks like it crashed.
                win.show();
                clean();
            }
        });

        //THE SCRUB IS ../core/window's AND THIS ONLY WRITES WHAT IT IS GIVEN --
        //but a plugin that writes the screen to disk is the one place worth
        //checking that the scrub really ran, because it is the file that ends up
        //attached to a bug report.
        it('writes the scrubbed markup, not the raw page', async function () {
            clean();

            try {
                await ipc.invoke('snapshot', { path: here }, asPerson);

                var wrote = fs.readFileSync(here + '.html', 'utf8');

                assert.equal(wrote, imports.window.markup(),
                    'what was written is not what the window hands out, so something '
                    + 'is reading the page a second way');
            } finally { clean(); }
        });

        //AND THE COMMAND REALLY GOES THROUGH IT. A guard declared and not asked
        //is the shape ../core/may exists to prevent -- a mark saying something
        //the mechanism does not do.
        //
        //IT DOES NOT RE-DECLARE `snapshot` TO SET THIS UP. `declare` REPLACES,
        //and the undo it hands back DELETES -- so a probe that declared the real
        //capability and then undid it would leave the app with nothing guarding
        //the screen for the rest of the run, silently, and every test after this
        //one would pass for the wrong reason.
        //IT DOES WRITE A `never` INTO THE REAL may.json FOR THE LENGTH OF THIS
        //TEST, and takes it out again in `finally`. There is no way to ask the
        //registry for a refusal that is not written down -- `once` and `run`
        //both allow -- so the choice is between this and not checking the guard
        //at all. The window it is exposed for is a crash between the two lines.
        it('refuses an outside caller that nobody answered for', async function () {
            var said = may.decide('snapshot', 'never', { window: true, trusted: true });
            assert.ok(!said.refused, said.refused);

            try {
                var out = await ipc.invoke('snapshot', { path: here }, { overTheWire: true });

                assert.ok(out.skipped, 'it wrote the screen down after being told never');
                assert.ok(!fs.existsSync(here + '.html'), 'it wrote the file anyway');
            } finally {
                //PUT BACK TO NOBODY HAVING SAID, not to some other answer. A
                //suite that left a `never` behind would turn the key and both
                //commands off in the real app, for ever.
                may.forget('snapshot', { window: true, trusted: true });
                clean();
            }
        });
    });

    register();
}
module.exports = plugin;
