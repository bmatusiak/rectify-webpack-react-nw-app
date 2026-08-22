var fs = require('fs');
var os = require('os');
var path = require('path');

//the window itself, from the process that owns the handle. nw.Window cannot be
//had anywhere else, and neither can a compositor, so capture in particular is
//only answerable here.
//
//nothing in here hides the window or closes it. Both are real, both would
//affect everything that runs afterwards, and a test that leaves the app in a
//different state than it found it is a test that breaks the next one.
//
//ONE OF THEM MINIMIZES IT, and puts it back in a `finally` and then proves it
//came back. The flag that answers "is there a frame to take" is set by nw's own
//`minimize` event, so the only way to test the answer is to cause the event.

plugin.consumes = ['selftest', 'app', 'window'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var win = imports.window;

    function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    describe('the window, in the running app', function () {

        it('is open, which is how anything got this far', function () {
            assert.equal(win.isOpen, true);
            assert.ok(win.current, 'no window handle');
        });

        it('photographs itself', async function () {
            var file = path.join(os.tmpdir(), 'probe-window-' + process.pid + '.png');
            var shot = await win.capture({ format: 'png' });

            assert.ok(shot.buffer && shot.buffer.length > 0, 'an empty picture');
            assert.equal(shot.format, 'png');
            assert.ok(shot.width > 0 && shot.height > 0, shot.width + 'x' + shot.height);

            //and it is really a png, not merely called one
            assert.equal(shot.buffer.slice(1, 4).toString('ascii'), 'PNG');

            fs.writeFileSync(file, shot.buffer);
            assert.equal(fs.statSync(file).size, shot.buffer.length);
            fs.unlinkSync(file);
        });

        it('reads the size out of the file rather than off the window', function () {
            //a screen at 2x hands back an image twice the size the window asked
            //to be, and the number worth reporting is the one in the file
            var measure = require('./main').measure;
            var png = Buffer.alloc(24);

            Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(png, 0);
            png.write('IHDR', 12, 'ascii');
            png.writeUInt32BE(1326, 16);
            png.writeUInt32BE(768, 20);

            var size = measure(png, 'png');
            assert.equal(size.width, 1326);
            assert.equal(size.height, 768);
        });

        //A MINIMIZED WINDOW HAS NO FRAME, AND THAT IS NOT A FAULT.
        //
        //This one does minimize the window, because the flag it checks is set
        //by nw's own event and there is no way to set it from here that would
        //prove anything. It puts the window back in a `finally`, and it is the
        //reason the capture answers at once instead of waiting fifteen seconds
        //to guess.
        it('says there is no frame rather than waiting, when the window is minimized', async function () {
            var w = nw.Window.get();

            try {
                w.minimize();

                //WAIT FOR THE FLAG, NOT FOR A NUMBER OF MILLISECONDS -- and
                //wait for it on `isMinimized` rather than by trying to
                //photograph, because a capture that is NOT skipped is the
                //fifteen-second backstop, and sixty of those is a suite that
                //never finishes.
                for (var i = 0; i < 60 && !win.isMinimized; i++) await pause(50);
                assert.ok(win.isMinimized, 'nw never said the window was minimized');

                var shot = await win.capture({ format: 'png' });
                assert.ok(shot.skipped, 'it tried to photograph a minimized window');
                assert.ok(String(shot.why).indexOf('minimi') >= 0,
                    'the reason does not say why: ' + shot.why);
                assert.equal(shot.buffer, undefined, 'a skip came back with a picture attached');
            } finally {
                w.restore();
                w.focus();
                await pause(150);
            }
        });

        //AND IT COMES BACK. A test that leaves the app unable to photograph
        //itself would take every later shot with it.
        it('photographs itself again once the window is back', async function () {
            var shot = await win.capture({ format: 'png' });
            assert.ok(!shot.skipped, 'still skipping after the window was restored: ' + shot.why);
            assert.ok(shot.buffer && shot.buffer.length > 0, 'no picture came back');
        });
    });

    register();
}
module.exports = plugin;
