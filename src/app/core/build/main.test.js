//build is what puts the app's two other halves in front of you: webpack in
//development, the bundle carried inside main.bin when packaged. Its service is
//one function, `ready()`, which src/boot.js waits on before it listens.
//
//so the interesting question is not the shape of that service -- it is whether
//the thing it was doing worked. The node half registering its commands is the
//evidence, and it is evidence only from here: the server context cannot tell
//you it loaded, because if it did not, nothing there is running to ask.

plugin.consumes = ['selftest', 'app', 'build', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, build, ipc } = imports;

    describe('build, in the running app', function () {

        it('finished, which is what let the rest of this load', async function () {
            await build.ready();
            assert.ok(true);
        });

        it('settles the same way every time it is asked', async function () {
            //ready() hands back a cached promise rather than starting again --
            //boot waits on it, and so may anything else
            await build.ready();
            await build.ready();
            assert.ok(true);
        });

        it('actually loaded the node half', function () {
            //these are registered by src/app/*/server.js as they load. If the
            //bundle failed to build or the graph would not resolve, they are
            //simply absent and the app runs on looking almost fine.
            var commands = ipc.commands();

            ['hello', 'open', 'hide', 'capture', 'click'].forEach(function (name) {
                assert.ok(commands.indexOf(name) >= 0,
                    name + ' is missing, so a server half did not load: ' + commands.join(', '));
            });
        });

        it('knows which of the three builds it is', function () {
            assert.equal(typeof app.isPackaged, 'boolean');
        });
    });

    register();
}
module.exports = plugin;
