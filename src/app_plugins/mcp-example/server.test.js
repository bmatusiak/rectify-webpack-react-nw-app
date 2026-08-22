//WHAT THE EXAMPLE OFFERS, ANSWERED BY THE REAL APP.
//
//../mcp/server.test.js is about the registries -- what a plugin may register
//and what the four ipc commands make of it -- and it checks that these
//registrations EXIST. This one is about whether they WORK: a call that runs, a
//read that reads, and the two ways a uri can be wrong.
//
//NOTHING HERE REGISTERS ANYTHING. Every other suite in this app that touches
//the mcp service puts its own tool in and takes it back in a `finally`; this
//one has nothing to clean up, because the thing under test is what the app is
//already offering. Which also means it fails if ../server.js stops registering,
//which is the point.

plugin.consumes = ['selftest', 'ipc', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var ipc = imports.ipc;

    function call(name, args) {
        return ipc.invoke('mcp:call', { name: name, arguments: args || {} });
    }

    function read(uri) {
        return ipc.invoke('mcp:read', { uri: uri });
    }

    describe('the mcp example, against the app it is describing', function () {

        //THE TOOL THAT DECLARES AN outputSchema, so the answer has to arrive as
        //structuredContent as well as text -- and be about THIS process. A
        //fixture would satisfy the schema and prove nothing.
        it('answers app_status about the app that is running', async function () {
            var answer = await call('app_status');
            var status = answer.result.structuredContent;

            assert.ok(status, 'no structuredContent, so an outputSchema client sees nothing');
            assert.equal(status.name, imports.appPackage.name);
            assert.equal(status.pid, process.pid, 'app_status is describing some other process');
            assert.ok(status.uptimeSeconds >= 0, 'uptime: ' + status.uptimeSeconds);

            //and the same json in a text block, for a client that validates
            //nothing -- the spec asks for both, and only one of them shows up
            //in a transcript
            assert.ok(answer.result.content[0].text.indexOf(imports.appPackage.name) >= 0);
        });

        it('reads the resolved graph, with every plugin named after its folder', async function () {
            var answer = await read('app://plugins');
            var graph = JSON.parse(answer.contents[0].text);

            assert.ok(graph.length > 5, 'only ' + graph.length + ' plugins in the graph');

            //rectify names a plugin after its setup function and every setup
            //function here is called `plugin` -- so a graph full of `plugin` is
            //a boot that stopped stamping. See src/target.js.
            var unnamed = graph.filter(function (one) { return one.name === 'plugin'; });
            assert.equal(unnamed.length, 0, unnamed.length + ' plugins came back called `plugin`');
        });

        //THE TEMPLATE HAS TO REACH EVERY TREE, which is the one thing about it
        //that is not obvious: it resolves a folder name against package.json's
        //srcDirs, so `core/io` is in src/app and `mcp` is in src/app_plugins.
        //A version of this that only looked in the first tree would pass every
        //other assertion in this file.
        it('finds a README in either tree', async function () {
            var own = await read('app://readme/core/io');
            assert.ok(own.contents[0].text.indexOf('# core/io') >= 0 ||
                own.contents[0].text.length > 100, 'core/io README came back empty');

            var beside = await read('app://readme/mcp');
            assert.ok(!beside.unknown, 'the second tree is invisible to the template: ' + beside.why);
            assert.ok(beside.contents[0].text.length > 100, 'the mcp README came back empty');
        });

        //A URI IS UNTRUSTED INPUT, and both ways of being wrong are "not
        //found" rather than "the server broke" -- -32002, not -32603. A read
        //that throws through would tell a client the app is faulty when it is
        //the request that was.
        it('refuses a traversal and a plugin that is not there, the same way', async function () {
            var out = await read('app://readme/../../../etc/passwd');
            assert.ok(out.unknown, 'a path traversal was answered');

            var missing = await read('app://readme/no-such-plugin');
            assert.ok(missing.unknown, 'a plugin that does not exist was answered');
        });

        //AND A TOOL THAT FAILS IS A RESULT, not a protocol error: `click` with
        //a selector that matches nothing is the model's problem to solve, and
        //it can only solve it if it is told.
        it('reports a click that found nothing as a result, not an error', async function () {
            var answer = await call('click', { selector: '#nothing-is-called-this' });

            assert.ok(answer.result, 'a failing tool came back as unknown');
            assert.equal(answer.unknown, undefined);
        });
    });

    register();
}

module.exports = plugin;
