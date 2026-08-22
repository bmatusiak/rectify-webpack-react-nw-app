//THE REGISTRIES, IN THE RUNNING APP.
//
//These register against the real service, which is why every one of them takes
//its registration back in a `finally`: the app somebody is using would
//otherwise be offering `probe_tool` to whatever MCP client is connected to it.
//The same rule ../../app/ui/banner's tests found the hard way -- the service
//belongs to the app, not to the suite.
//
//What the PROTOCOL makes of these shapes is test/mcp.test.js, which speaks
//JSON-RPC to tools/mcp.js over a pipe. This half is about what a plugin can
//register and what comes back out of the four ipc commands.

plugin.consumes = ['selftest', 'mcp', 'ipc', 'app', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var mcp = imports.mcp;
    var ipc = imports.ipc;
    var app = imports.app;

    describe('mcp, in the running app', function () {

        it('hands out the four registries', function () {
            assert.equal(typeof mcp.tool, 'function');
            assert.equal(typeof mcp.resource, 'function');
            assert.equal(typeof mcp.template, 'function');
            assert.equal(typeof mcp.prompt, 'function');
        });

        //THE EXAMPLE PLUGIN IS PART OF THE APP, so its offering is a fact about
        //the running app rather than something this test sets up. If
        //../mcp-example stops registering, this says so.
        it('is offering what the example plugin registered', function () {
            var offering = mcp.offering;

            assert.ok(offering.tools.indexOf('app_status') >= 0, offering.tools.join(', '));
            assert.ok(offering.tools.indexOf('screenshot') >= 0, offering.tools.join(', '));
            assert.ok(offering.resources.indexOf('app://plugins') >= 0, offering.resources.join(', '));
            assert.ok(offering.templates.length > 0, 'no resource template');
            assert.ok(offering.prompts.indexOf('explain_plugin') >= 0, offering.prompts.join(', '));
        });

        //AND `quit` IS NOT AMONG THEM. The app answers fourteen ipc commands and
        //this deliberately reflects none of them -- if that ever becomes
        //"expose ipc.commands()", this is the test that should stop it.
        it('offers nothing that can stop the app', function () {
            var offering = mcp.offering;
            ['quit', 'hide', 'serve', 'browser'].forEach(function (verb) {
                assert.equal(offering.tools.indexOf(verb), -1, verb + ' is being offered as a tool');
            });
        });

        it('describes a tool the way the protocol wants it', async function () {
            var handle = mcp.tool('probe_tool', {
                title: 'A probe',
                description: 'registered by a test, and taken back immediately',
                inputSchema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] },
                run: function (args) { return 'you said ' + args.word; }
            });

            try {
                var described = await ipc.invoke('mcp:describe');
                var found = described.tools.filter(function (one) { return one.name == 'probe_tool'; })[0];

                assert.ok(found, 'the tool was not described');
                assert.equal(found.description, 'registered by a test, and taken back immediately');
                assert.equal(found.inputSchema.required[0], 'word');

                //`run` is not part of the protocol and must not go out on it
                assert.equal(found.run, undefined, 'the implementation was sent to the client');

                var answer = await ipc.invoke('mcp:call', { name: 'probe_tool', arguments: { word: 'hello' } });
                assert.equal(answer.result.content[0].text, 'you said hello');
                assert.ok(!answer.result.isError, 'a tool that worked said it did not');
            } finally {
                handle.remove();
            }
        });

        //A SCHEMA IS NOT OPTIONAL, even when there are no arguments: a client
        //that gets none cannot tell "no arguments" from "somebody forgot".
        it('gives a tool with no arguments an empty schema rather than none', async function () {
            var handle = mcp.tool('probe_bare', { description: 'no arguments', run: function () { return 'ok'; } });

            try {
                var described = await ipc.invoke('mcp:describe');
                var found = described.tools.filter(function (one) { return one.name == 'probe_bare'; })[0];
                assert.equal(found.inputSchema.type, 'object');
            } finally {
                handle.remove();
            }
        });

        //THE DISTINCTION THE WHOLE PLUGIN TURNS ON. An unknown tool is the
        //client's mistake; a tool that ran and failed is a result the model is
        //meant to read and act on.
        it('separates a tool that failed from a tool that is not there', async function () {
            var handle = mcp.tool('probe_throws', {
                description: 'always fails',
                run: function () { throw new Error('the disk is on fire'); }
            });

            try {
                var failed = await ipc.invoke('mcp:call', { name: 'probe_throws', arguments: {} });
                assert.equal(failed.result.isError, true, 'a failing tool was not marked as an error');
                assert.ok(failed.result.content[0].text.indexOf('on fire') >= 0, failed.result.content[0].text);
                assert.equal(failed.unknown, undefined, 'a failing tool was reported as unknown');

                var missing = await ipc.invoke('mcp:call', { name: 'probe_absent', arguments: {} });
                assert.equal(missing.unknown, true, 'an unknown tool was not reported as unknown');
            } finally {
                handle.remove();
            }
        });

        it('sends an object answer as text and as structuredContent, when there is a schema', async function () {
            var withSchema = mcp.tool('probe_shaped', {
                description: 'has an output schema',
                outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
                run: function () { return { n: 7 }; }
            });
            var without = mcp.tool('probe_plain', {
                description: 'has none',
                run: function () { return { n: 7 }; }
            });

            try {
                var shaped = await ipc.invoke('mcp:call', { name: 'probe_shaped', arguments: {} });
                assert.equal(shaped.result.structuredContent.n, 7);
                assert.ok(shaped.result.content[0].text.indexOf('"n": 7') >= 0, 'the json is not also text');

                //without a schema there is nothing to validate it against, so
                //sending it would be asking a client to trust an unlabelled shape
                var plain = await ipc.invoke('mcp:call', { name: 'probe_plain', arguments: {} });
                assert.equal(plain.result.structuredContent, undefined);
                assert.ok(plain.result.content[0].text.indexOf('"n": 7') >= 0);
            } finally {
                withSchema.remove();
                without.remove();
            }
        });

        it('replaces a name rather than offering it twice', async function () {
            var first = mcp.tool('probe_twice', { description: 'first', run: function () { return 'first'; } });
            var second = mcp.tool('probe_twice', { description: 'second', run: function () { return 'second'; } });

            try {
                var described = await ipc.invoke('mcp:describe');
                var all = described.tools.filter(function (one) { return one.name == 'probe_twice'; });

                assert.equal(all.length, 1, all.length + ' tools called probe_twice');
                assert.equal(all[0].description, 'second', 'the first registration won');
            } finally {
                first.remove();
                second.remove();
            }
        });

        it('refuses a prompt that is missing a required argument', async function () {
            var handle = mcp.prompt('probe_prompt', {
                description: 'wants a word',
                arguments: [{ name: 'word', description: 'anything', required: true }],
                get: function (args) { return 'you said ' + args.word; }
            });

            try {
                var refused = await ipc.invoke('mcp:prompt', { name: 'probe_prompt', arguments: {} });
                assert.equal(refused.missing[0], 'word');

                var got = await ipc.invoke('mcp:prompt', { name: 'probe_prompt', arguments: { word: 'yes' } });

                //a plain string means "the user said this", written out in full
                //by the service so a caller does not have to
                assert.equal(got.messages[0].role, 'user');
                assert.equal(got.messages[0].content.type, 'text');
                assert.equal(got.messages[0].content.text, 'you said yes');
            } finally {
                handle.remove();
            }
        });

        it('reads a resource, and says when there is nothing at that uri', async function () {
            var handle = mcp.resource('probe://thing', {
                description: 'a resource registered by a test',
                mimeType: 'text/plain',
                read: function () { return 'the contents'; }
            });

            try {
                var read = await ipc.invoke('mcp:read', { uri: 'probe://thing' });
                assert.equal(read.contents[0].text, 'the contents');
                assert.equal(read.contents[0].uri, 'probe://thing');
                assert.equal(read.contents[0].mimeType, 'text/plain');

                var nothing = await ipc.invoke('mcp:read', { uri: 'probe://nowhere' });
                assert.equal(nothing.unknown, true);
            } finally {
                handle.remove();
            }
        });

        //A REFUSED READ IS "NOT FOUND", NOT "THE SERVER BROKE". The template in
        //../mcp-example throws on a path that climbs, and the client should be
        //told the resource is not there rather than that the app is faulty.
        it('turns a read that throws into not-found, with the reason', async function () {
            var handle = mcp.resource('probe://refuses', {
                read: function () { throw new Error('not a plugin folder: ../../etc'); }
            });

            try {
                var answer = await ipc.invoke('mcp:read', { uri: 'probe://refuses' });
                assert.equal(answer.unknown, true);
                assert.ok(String(answer.why).indexOf('not a plugin folder') >= 0, answer.why);
            } finally {
                handle.remove();
            }
        });

        //---- the second transport ---------------------------------------------
        //
        //MCP over the app's own http server, which is a LISTENING surface and so
        //is behind the browser viewer's switch. These turn it on and put it back
        //the way they found it -- io/server.test.js does the same, and for the
        //same reason: the switch belongs to whoever is using the app.

        function post(url, body, headers) {
            return fetch(url, {
                method: 'POST',
                headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
                body: JSON.stringify(body)
            });
        }

        async function whileServing(run) {
            var host = app.host;
            var was = host.http.serving;
            if (!was) await host.http.setServing(true);

            try { return await run(host.http.url); }
            finally { if (!was) await host.http.setServing(false); }
        }

        it('answers the protocol over http as well as over the socket', async function () {
            await whileServing(async function (url) {
                var answer = await post(url + 'mcp', {
                    jsonrpc: '2.0', id: 1, method: 'initialize',
                    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
                });

                assert.equal(answer.status, 200);
                var body = await answer.json();

                assert.equal(body.result.protocolVersion, '2025-06-18');
                assert.equal(body.result.serverInfo.name, imports.appPackage.name);

                //THE SAME ANSWER AS THE OTHER TRANSPORT, which is the point of
                //./rpc.js being shared: if these ever diverge, one of the two
                //grew a second implementation.
                var tools = await (await post(url + 'mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
                var overSocket = await ipc.invoke('mcp:describe');

                assert.equal(tools.result.tools.length, overSocket.tools.length,
                    'http and the socket disagree about how many tools there are');
            });
        });

        //DNS REBINDING IS THE NAMED RISK IN THE TRANSPORT SPEC. A page on the
        //open internet cannot read this port's replies, but it can send to it --
        //and "cannot read the reply" is no comfort when the request was a click.
        it('refuses an origin that is not local, and takes one that is', async function () {
            await whileServing(async function (url) {
                var foreign = await post(url + 'mcp',
                    { jsonrpc: '2.0', id: 3, method: 'ping' },
                    { origin: 'https://evil.example.com' });

                assert.equal(foreign.status, 403, 'a foreign origin was answered');

                var mine = await post(url + 'mcp',
                    { jsonrpc: '2.0', id: 4, method: 'ping' },
                    { origin: 'http://localhost:3000' });

                assert.equal(mine.status, 200, 'a local origin was refused');
            });
        });

        //A NOTIFICATION HAS NOTHING TO SAY BACK, and the spec asks for 202 with
        //no body rather than an empty result object.
        it('answers a notification with 202 and nothing', async function () {
            await whileServing(async function (url) {
                var answer = await post(url + 'mcp', { jsonrpc: '2.0', method: 'notifications/initialized' });

                assert.equal(answer.status, 202);
                assert.equal((await answer.text()).length, 0, 'it said something to a notification');
            });
        });

        //THERE IS NO STREAM, and saying 405 with `Allow: POST` is how a client
        //learns that rather than concluding the endpoint does not exist.
        it('says there is no stream rather than 404', async function () {
            await whileServing(async function (url) {
                var answer = await fetch(url + 'mcp');
                assert.equal(answer.status, 405);
                assert.equal(answer.headers.get('allow'), 'POST');
            });
        });

        //AND IT IS CLOSED WHEN THE VIEWER IS OFF. The window is on the bridge in
        //every build, so turning the browser viewer off is meant to leave
        //nothing outside the app able to reach it -- an MCP endpoint that kept
        //answering would be a hole in exactly that promise.
        it('is closed while the browser viewer is off', async function () {
            var host = app.host;
            var was = host.http.serving;
            if (was) await host.http.setServing(false);

            try {
                var url = host.http.url;
                if (!url) return; //nothing is listening at all, which is the same answer

                var answer = await post(url + 'mcp', { jsonrpc: '2.0', id: 5, method: 'ping' });
                assert.ok(answer.status >= 400, 'the endpoint answered with the viewer off: ' + answer.status);
            } finally {
                if (was) await host.http.setServing(true);
            }
        });
    });

    register();
}
module.exports = plugin;
