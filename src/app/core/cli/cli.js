//the command table for src/cli.js.
//
//a command is local unless it is not: anything the table does not know is
//forwarded to the running app over the control socket, so a plugin that answers
//on ipc needs no cli half at all to be reachable from the terminal.

plugin.consumes = ['app', 'ipc'];
plugin.provides = ['cli'];
async function plugin(imports, register) {
    var { app, ipc } = imports;

    var commands = {};

    function command(name, options) {
        commands[name] = options;//{ help, args, run(data) }
    }

    command('help', {
        help: 'list what this understands',
        run: async function () {
            var local = Object.keys(commands).sort();
            var remote = [];
            try { remote = (await ipc.call('commands')).filter(function (n) { return local.indexOf(n) < 0; }); }
            catch (e) { /* not running; local commands still list */ }

            console.log(app.appPackage.title + ' ' + app.appPackage.version);
            console.log('');
            console.log('  npm run cli -- <command> [json]');
            console.log('');
            local.forEach(function (n) {
                console.log('  ' + n.padEnd(12) + (commands[n].help || ''));
            });
            if (remote.length) {
                console.log('');
                console.log('  from the running app:');
                remote.forEach(function (n) { console.log('  ' + n); });
            }
        }
    });

    await register(null, {
        cli: {
            command: command,

            run: async function (argv) {
                var name = argv[0] || 'help';
                var rest = argv.slice(1);
                var data = {};

                if (rest.length) {
                    if (rest[0].charAt(0) == '{') {
                        try { data = JSON.parse(rest[0]); }
                        catch (e) { throw new Error('that did not parse as json: ' + rest[0]); }
                    }

                    //a command can name what it takes, so the common case is
                    //typed the way it is spoken -- `click Save` rather than
                    //`click {"selector":"Save"}`. json still wins if you want
                    //to say something the names do not cover.
                    else if (commands[name] && commands[name].args) {
                        commands[name].args.forEach(function (key, i) {
                            if (rest[i] !== undefined) data[key] = rest[i];
                        });
                    }

                    else throw new Error('"' + name + '" takes json: ' + rest[0]);
                }

                if (commands[name]) return commands[name].run(data);

                //not ours, so ask the app
                var result = await ipc.call(name, data);
                if (result !== null && result !== undefined) console.log(
                    typeof result == 'string' ? result : JSON.stringify(result, null, 2));
            }
        }
    });
}
module.exports = plugin;
