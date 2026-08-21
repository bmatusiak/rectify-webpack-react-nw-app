var harness = require('@bmatusiak/rectify/harness.js');

//`npm run cli -- status` is the demo's terminal half, and the only command
//here that has to behave when there is nothing to talk to. That is its whole
//job: say plainly whether the app is up, and leave with the right exit code so
//a script can act on it.

var { describe, it, assert } = harness;

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var cli = imports.cli;
    var ipc = imports.ipc;

    var realRunning = ipc.running;
    var realCall = ipc.call;

    //everything the command printed, and the code it left behind
    function say(fn) {
        var lines = [];
        var said = console.log;
        var code = process.exitCode;

        console.log = function () {
            lines.push(Array.prototype.join.call(arguments, ' '));
        };
        process.exitCode = 0;

        return Promise.resolve().then(fn).then(
            function () {
                var left = process.exitCode;
                console.log = said;
                process.exitCode = code;
                return { lines: lines.join('\n'), exit: left };
            },
            function (e) { console.log = said; process.exitCode = code; throw e; });
    }

    function pretend(running, info) {
        ipc.running = function () { return Promise.resolve(running); };
        ipc.call = function () { return Promise.resolve(info); };
    }

    function stop() { ipc.running = realRunning; ipc.call = realCall; }

    describe('status, from the terminal', function () {

        it('says it is not running, and leaves a code that says so too', async function () {
            pretend(false);
            var out = await say(function () { return cli.run(['status']); });
            stop();

            assert.ok(out.lines.indexOf('not running') >= 0, out.lines);
            assert.equal(out.exit, 1, 'a script needs to be able to tell');
        });

        it('says where it looked, so a wrong socket is visible', async function () {
            pretend(false);
            var out = await say(function () { return cli.run(['status']); });
            stop();

            assert.ok(out.lines.indexOf(ipc.address) >= 0, out.lines);
        });

        it('reports what the app answered when it is up', async function () {
            pretend(true, {
                pid: 4321, url: 'http://localhost:1234/', uptime: 12.7,
                memory: 300 * 1048576, packaged: false, tray: ['One', 'Two']
            });

            var out = await say(function () { return cli.run(['status']); });
            stop();

            assert.ok(out.lines.indexOf('running') >= 0, out.lines);
            assert.ok(out.lines.indexOf('4321') >= 0, out.lines);
            assert.ok(out.lines.indexOf('300 MB') >= 0, out.lines);
            assert.ok(out.lines.indexOf('One, Two') >= 0, out.lines);
            assert.equal(out.exit, 0);
        });

        it('says plainly that a build serves nothing, rather than printing null', async function () {
            pretend(true, { pid: 1, url: null, uptime: 1, memory: 1048576, packaged: true, tray: [] });

            var out = await say(function () { return cli.run(['status']); });
            stop();

            assert.ok(out.lines.indexOf('null') < 0, 'it printed null: ' + out.lines);
            assert.ok(out.lines.indexOf('serves nothing') >= 0, out.lines);
        });
    });

    register();
}
module.exports = plugin;
