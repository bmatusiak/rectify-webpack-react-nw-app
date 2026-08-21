var fs = require('fs');
var os = require('os');
var path = require('path');
var harness = require('@bmatusiak/rectify/harness.js');

//the window belongs to main.js; what is here is a controller and the four
//commands the terminal reaches it by. The one with real logic is capture: the
//buffer stops here and becomes a file, and where that file lands is decided
//here rather than by whoever asked.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'ipc', 'window'];
plugin.provides = [];
function plugin(imports, register) {
    var { app, window: win } = imports;
    var control = app.host.ipc;

    function ask(name, data) { return control.invoke(name, data); }

    describe('window, server side', function () {

        it('answers the four the cli asks for', function () {
            ['open', 'hide', 'capture', 'quit'].forEach(function (name) {
                assert.ok(control.commands().indexOf(name) >= 0, name + ' is not registered');
            });
        });

        it('passes what it is asked straight to the window main.js owns', function () {
            assert.equal(win.url, app.host.window.url);
            assert.equal(win.isOpen, app.host.window.isOpen);
        });

        it('writes the picture where it was told', async function () {
            var file = path.join(os.tmpdir(), 'probe-capture-' + process.pid + '.png');
            var out = await ask('capture', { path: file });

            assert.equal(out.path, file);
            assert.ok(fs.existsSync(file), 'nothing was written');
            assert.equal(out.bytes, fs.statSync(file).size);

            fs.unlinkSync(file);
        });

        it('makes a relative path absolute rather than leaving it to chance', async function () {
            //the app's working directory is wherever it was launched from, so
            //a bare name has to be resolved rather than passed on
            var out = await ask('capture', { path: 'probe-relative.png' });

            assert.ok(path.isAbsolute(out.path), out.path);
            assert.equal(path.basename(out.path), 'probe-relative.png');

            fs.unlinkSync(out.path);
        });

        it('reports the size and shape it wrote, not the request', async function () {
            var out = await ask('capture', { path: path.join(os.tmpdir(), 'probe-shape-' + process.pid + '.png') });

            assert.equal(out.format, 'png');
            assert.equal(out.width, 8);
            assert.equal(out.height, 4);

            fs.unlinkSync(out.path);
        });

        it('answers quit before going, or the caller only sees a dropped socket', async function () {
            var said = await ask('quit', {});
            assert.equal(said, 'quitting');
        });
    });

    register();
}
module.exports = plugin;
