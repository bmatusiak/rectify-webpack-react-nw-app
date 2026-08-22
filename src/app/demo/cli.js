//`status` IS A LOCAL COMMAND ONLY BECAUSE IT HAS TO ANSWER WHEN THE APP IS
//NOT RUNNING. Everything else the demo does is forwarded to the app over ipc
//and needs no file here; this one has to say "not running" without one, which
//is precisely the case a forwarded command cannot handle.

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
