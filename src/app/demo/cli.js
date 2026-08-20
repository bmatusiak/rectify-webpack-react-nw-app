//the demo's cli half. `npm run cli -- status` is this.

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

            var info = await ipc.call('hello');
            console.log('running');
            console.log('  socket   ' + ipc.address);
            console.log('  pid      ' + info.pid);
            console.log('  url      ' + (info.url || 'none, this build serves nothing'));
            console.log('  uptime   ' + Math.round(info.uptime) + 's');
            console.log('  memory   ' + Math.round(info.memory / 1048576) + ' MB');
            console.log('  packaged ' + (info.packaged ? 'yes' : 'no'));
            if (info.tray && info.tray.length) console.log('  tray     ' + info.tray.join(', '));
        }
    });

    await register(null, {});
}
module.exports = plugin;
