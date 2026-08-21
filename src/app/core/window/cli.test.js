var os = require('os');
var path = require('path');
var harness = require('@bmatusiak/rectify/harness.js');

//`npm run cli -- capture` is the window plugin's terminal half. It does one
//thing the other halves cannot: it decides where the file goes.
//
//that has to happen here rather than in the app, because the app's working
//directory is wherever it was launched from and yours is wherever you are
//standing. A bare `shot.png` should land in front of you.

var { describe, it, assert } = harness;

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var cli = imports.cli;
    var ipc = imports.ipc;

    //stand in for the app, and keep what the command asked it for
    var asked = null;
    var real = ipc.call;

    function intercept(fn) {
        ipc.call = function (name, data) { asked = { name: name, data: data }; return Promise.resolve({
            path: data.path, bytes: 1234, format: data.format, width: 8, height: 4
        }); };

        return Promise.resolve()
            .then(fn)
            .then(function () { ipc.call = real; }, function (e) { ipc.call = real; throw e; });
    }

    describe('capture, from the terminal', function () {

        it('resolves a bare name against where you are, not where the app is', async function () {
            await intercept(async function () {
                await cli.run(['capture', 'shot.png']);
            });

            assert.ok(path.isAbsolute(asked.data.path), asked.data.path);
            assert.equal(path.basename(asked.data.path), 'shot.png');
            assert.equal(asked.data.path, path.resolve('shot.png'));
        });

        it('leaves an absolute path alone', async function () {
            var given = path.join(os.tmpdir(), 'somewhere-else.png');

            await intercept(async function () {
                await cli.run(['capture', given]);
            });

            assert.equal(asked.data.path, given);
        });

        it('makes up a name when none is given, and dates it', async function () {
            await intercept(async function () {
                await cli.run(['capture']);
            });

            var name = path.basename(asked.data.path);
            assert.ok(/^capture-\d{8}-\d{6}\.png$/.test(name), name);
        });

        it('takes the format as the second word, and defaults to png', async function () {
            await intercept(async function () { await cli.run(['capture', 'a.png']); });
            assert.equal(asked.data.format, 'png');

            await intercept(async function () { await cli.run(['capture', 'a.jpg', 'jpeg']); });
            assert.equal(asked.data.format, 'jpeg');
        });

        it('names a jpeg .jpg when it is the one making the name up', async function () {
            await intercept(async function () {
                await cli.run(['capture', '', 'jpeg']);
            });

            assert.ok(/\.jpg$/.test(asked.data.path), asked.data.path);
        });

        it('asks the app rather than doing anything itself', async function () {
            await intercept(async function () { await cli.run(['capture', 'x.png']); });
            assert.equal(asked.name, 'capture');
        });
    });

    register();
}
module.exports = plugin;
