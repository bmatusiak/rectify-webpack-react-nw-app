//THE SERVE COMMAND, IN THE TERMINAL'S OWN GRAPH.
//
//The cli half never opens a socket itself -- it turns words into a call and an
//answer into a line somebody can read -- so that is what is checked here, with
//`ipc` standing in for the app. Whether the switch actually moves is ../http's
//question, and the answer to it is in main.test.js.

plugin.consumes = ['selftest', 'cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { cli, ipc } = imports;

    //what the app was asked, and what the terminal was told
    function run(argv, answer) {
        var asked = [];
        var said = [];

        var call = ipc.call;
        var log = console.log;

        ipc.call = function (name, data) {
            asked.push({ name: name, data: data });
            return Promise.resolve(answer);
        };
        console.log = function () {
            said.push(Array.prototype.join.call(arguments, ' '));
        };

        return Promise.resolve()
            .then(function () { return cli.run(argv); })
            .then(function () { return { asked: asked, said: said.join('\n') }; },
                function (e) { return { asked: asked, said: said.join('\n'), error: e.message }; })
            .then(function (out) { ipc.call = call; console.log = log; return out; });
    }

    var ON = { serving: true, listening: true, url: 'http://localhost:8080/' };
    var OFF = { serving: false, listening: true, url: 'http://localhost:8080/' };
    var GONE = { serving: false, listening: false, url: null };

    describe('serve, from the terminal', function () {

        it('is in the table with a line of help', function () {
            assert.ok(cli.command);
        });

        it('turns the words a person types into the answer the app wants', async function () {
            var on = await run(['serve', 'on'], ON);
            assert.equal(on.asked[0].name, 'serve');
            assert.equal(on.asked[0].data.on, true);

            var off = await run(['serve', 'off'], OFF);
            assert.equal(off.asked[0].data.on, false);
        });

        //because `serve stop` is what somebody types when `serve off` did not
        //occur to them, and refusing it teaches nothing
        it('takes the other words that mean the same thing', async function () {
            var yes = await run(['serve', 'start'], ON);
            assert.equal(yes.asked[0].data.on, true);

            var no = await run(['serve', 'stop'], OFF);
            assert.equal(no.asked[0].data.on, false);

            var loud = await run(['serve', 'ON'], ON);
            assert.equal(loud.asked[0].data.on, true);
        });

        //A BARE `serve` ASKS, RATHER THAN TOGGLING. A toggle would be a trap in
        //a script: the same command twice leaves it where it started.
        it('asks rather than flipping when told nothing', async function () {
            var out = await run(['serve'], ON);
            assert.equal(out.asked[0].name, 'serve');
            assert.equal(out.asked[0].data.on, undefined);
        });

        it('refuses a word it cannot read rather than guessing', async function () {
            var out = await run(['serve', 'maybe'], ON);
            assert.ok(out.error, 'it accepted "maybe"');
            assert.ok(out.error.indexOf('serve on') >= 0, out.error);
            assert.equal(out.asked.length, 0, 'it asked the app anyway');
        });

        it('says where it is serving', async function () {
            var out = await run(['serve', 'on'], ON);
            assert.ok(out.said.indexOf('http://localhost:8080/') >= 0, out.said);
        });

        //OFF AND BROKEN ARE DIFFERENT FACTS. In development the port stays up
        //because webpack needs it, and a line that only said "off" would leave
        //somebody wondering why the url still answers.
        it('says the port is still up when only the viewer went away', async function () {
            var out = await run(['serve', 'off'], OFF);
            assert.ok(out.said.indexOf('off') >= 0, out.said);
            assert.ok(out.said.indexOf('webpack') >= 0, out.said);
        });

        it('says nothing about a port when there is not one', async function () {
            var out = await run(['serve', 'off'], GONE);
            assert.ok(out.said.indexOf('off') >= 0, out.said);
            assert.ok(out.said.indexOf('webpack') < 0, out.said);
        });
    });

    register();
}
module.exports = plugin;
