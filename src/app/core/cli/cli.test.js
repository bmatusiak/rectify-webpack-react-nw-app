var harness = require('@bmatusiak/rectify/harness.js');

//a test is a plugin. It consumes the services it is about, so the container
//hands it the real ones and loads it after them -- there is nothing to mock
//and nothing to stand up, because the app is already standing.
//
//what is checked here is the argument parsing, which is this plugin's own
//logic and the part with room to be quietly wrong: `click Save` and
//`click {"selector":"Save"}` have to reach the same command with the same
//data, and a command that never named an argument has to say so rather than
//silently dropping it.

var { describe, it, assert } = harness;

plugin.consumes = ['cli'];
plugin.provides = [];
function plugin(imports, register) {
    var cli = imports.cli;

    //a command that records what it was handed, rather than doing anything
    var seen = null;
    cli.command('probe', {
        help: 'used by the tests, and by nothing else',
        args: ['first', 'second'],
        run: function (data) { seen = data; }
    });

    cli.command('probe-strict', {
        help: 'takes json or nothing',
        run: function (data) { seen = data; }
    });

    describe('cli argument parsing', function () {

        it('maps bare arguments onto the names a command declared', async function () {
            seen = null;
            await cli.run(['probe', 'Save', 'now']);
            assert.equal(seen.first, 'Save');
            assert.equal(seen.second, 'now');
        });

        it('leaves a name unset rather than undefined-ing it', async function () {
            seen = null;
            await cli.run(['probe', 'Save']);
            assert.equal(seen.first, 'Save');
            assert.ok(!('second' in seen), 'second should be absent, got ' + JSON.stringify(seen));
        });

        it('takes json, and json wins over the names', async function () {
            seen = null;
            await cli.run(['probe', '{"first":"from json","extra":1}']);
            assert.equal(seen.first, 'from json');
            assert.equal(seen.extra, 1);
        });

        it('says so when the json does not parse', async function () {
            var complaint = null;
            try { await cli.run(['probe', '{not json']); }
            catch (e) { complaint = e.message; }

            assert.ok(complaint, 'it should have refused');
            assert.ok(complaint.indexOf('json') >= 0, complaint);
        });

        it('refuses a bare argument for a command that never named one', async function () {
            var complaint = null;
            try { await cli.run(['probe-strict', 'bare']); }
            catch (e) { complaint = e.message; }

            assert.ok(complaint, 'it should have refused');
            assert.ok(complaint.indexOf('probe-strict') >= 0, complaint);
        });

        it('asks for nothing and gets an empty object, not undefined', async function () {
            seen = null;
            await cli.run(['probe']);
            assert.ok(seen && typeof seen === 'object', 'got ' + seen);
        });
    });

    describe('the command table', function () {

        it('carries the commands the other plugins added', async function () {
            //proves the graph really loaded them, not that this file listed them
            var listed = [];
            var said = console.log;
            console.log = function (line) { listed.push(String(line)); };
            try { await cli.run(['help']); } finally { console.log = said; }

            var text = listed.join('\n');
            ['capture', 'click', 'fill', 'read', 'status', 'views'].forEach(function (name) {
                assert.ok(text.indexOf(name) >= 0, 'help should mention ' + name);
            });
        });

        it('gives every command a line of help', async function () {
            var listed = [];
            var said = console.log;
            console.log = function (line) { listed.push(String(line)); };
            try { await cli.run(['help']); } finally { console.log = said; }

            listed.filter(function (l) { return /^ {2}[a-z-]+ /.test(l); })
                .forEach(function (line) {
                    assert.ok(line.trim().split(/\s+/).length > 1, 'no help: ' + line);
                });
        });
    });

    register();
}
module.exports = plugin;
