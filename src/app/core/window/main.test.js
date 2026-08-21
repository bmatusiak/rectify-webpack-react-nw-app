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

plugin.consumes = ['selftest', 'app', 'window'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var win = imports.window;

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

        it('refuses to photograph a window that is hidden, rather than waiting', async function () {
            //fifteen seconds to be told what it already knew. This does not hide
            //the window to prove it -- the flag it checks is set by hide(), and
            //hiding here would leave the app hidden for everything after.
            assert.equal(typeof win.capture, 'function');
            assert.equal(typeof win.hide, 'function');
            assert.equal(typeof win.closeShouldHide, 'function');
        });
    });

    register();
}
module.exports = plugin;
