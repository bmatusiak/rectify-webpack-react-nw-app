var harness = require('@bmatusiak/rectify/harness.js');

//the demo's node half answers the System and Data pages. Every number on those
//pages comes from here, so what is worth pinning is that they are answers about
//THIS process rather than anything made up. That was a real bug once: the Data
//page read the filesystem for its list, which is empty in a package.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var host = imports.app.host;

    //the window and the cli reach these over a socket. A test in the same
    //process has none, so it asks the host to call one directly.
    function ask(name, data) { return host.ipc.invoke(name, data); }

    describe('the demo, server side', function () {

        it('answers on the control socket at all', function () {
            assert.ok(imports.ipc.commands().indexOf('hello') >= 0, imports.ipc.commands().join(', '));
        });

        it('reports this process, not a made up one', async function () {
            var hello = await ask('hello');
            assert.equal(hello.pid, process.pid);
            assert.ok(hello.memory > 0, 'memory was ' + hello.memory);
            assert.ok(hello.uptime >= 0, 'uptime was ' + hello.uptime);
        });

        it('says which build this is, and where its socket is', async function () {
            var hello = await ask('hello');
            assert.equal(typeof hello.packaged, 'boolean');
            assert.equal(hello.socket, host.ipc.address);
        });

        it('reads the tray from the tray, rather than keeping its own list', async function () {
            var before = (await ask('hello')).tray.length;
            var added = imports.app.services.tray.add({ label: 'probe-item' });

            var after = await ask('hello');
            assert.equal(after.tray.length, before + 1);
            assert.ok(after.tray.indexOf('probe-item') >= 0, after.tray.join(', '));

            added.remove();
            assert.equal((await ask('hello')).tray.length, before);
        });
    });

    register();
}
module.exports = plugin;
