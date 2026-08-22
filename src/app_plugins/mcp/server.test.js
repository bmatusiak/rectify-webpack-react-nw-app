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

plugin.consumes = ['selftest', 'mcp', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var mcp = imports.mcp;
    var ipc = imports.ipc;

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
    });

    register();
}
module.exports = plugin;
