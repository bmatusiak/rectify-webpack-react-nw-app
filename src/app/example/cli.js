//the cli half of the example plugin. delete this folder and build your own.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    cli.command('status', {
        help: 'is the app up, and where',
        run: async function () {
            if (!(await ipc.running())) {
                console.log('not running');
                console.log('  socket ' + ipc.address);
                process.exitCode = 1;
                return;
            }
            var hello = await ipc.call('hello');
            console.log('running');
            console.log('  socket ' + ipc.address);
            console.log('  pid    ' + hello.pid);
            console.log('  url    ' + hello.url);
        }
    });

    await register(null, {});
}
module.exports = plugin;
