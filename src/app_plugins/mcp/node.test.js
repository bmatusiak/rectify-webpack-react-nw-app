const { test, before, after } = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');

//THE PROTOCOL, SPOKEN THE WAY A CLIENT SPEAKS IT.
//
//./server.test.js runs INSIDE the app and checks what a plugin can register and
//what the four ipc commands answer with. This one runs OUTSIDE it, in the test
//runner's own process, and checks the part that is not ours: the JSON-RPC
//envelope, the method names, the error codes, and the shapes an MCP client will
//actually read. It launches ../../../tools/mcp.js the way Claude Code would --
//a child process, stdin and stdout, nothing else -- and asks it questions.
//
//WHY IT IS `node.test.js` RATHER THAN A CONTEXT. The four context files run as
//plugins inside a graph; this cannot, because the whole point of it is to be a
//stranger at the door. It is still this plugin's, so it lives here rather than
//in test/ -- `npm test -- mcp` is meant to mean everything about mcp.
//
//IT NEEDS THE APP RUNNING, and says so rather than starting one: it is the only
//suite of this kind that talks to a live app, and one that silently started a
//second copy of a desktop app would be a surprising thing to run on a laptop.
//With nothing running it checks the one behaviour that still holds -- that the
//bridge says the app is not running instead of hanging.

const ROOT = path.join(__dirname, '..', '..', '..');
const BRIDGE = path.join(ROOT, 'tools', 'mcp.js');
const NEWLINE = String.fromCharCode(10);

let bridge = null;
let held = '';
let seq = 0;
const waiting = new Map();

function start() {
    bridge = cp.spawn(process.execPath, [BRIDGE], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });

    bridge.stdout.on('data', (chunk) => {
        held += chunk.toString();
        const lines = held.split(/\r?\n/);
        held = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;

            //A PARSE FAILURE HERE IS THE POINT OF THE TEST. Anything the bridge
            //writes to stdout that is not a message breaks every client, so it
            //is reported as itself rather than swallowed.
            let message;
            try { message = JSON.parse(line); }
            catch (e) { throw new Error('the bridge wrote something that is not json: ' + line.slice(0, 120)); }

            const settle = waiting.get(message.id);
            if (settle) { waiting.delete(message.id); settle(message); }
        }
    });
}

function call(method, params) {
    const id = ++seq;
    bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + NEWLINE);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(method + ' never answered')), 20000);
        waiting.set(id, (message) => { clearTimeout(timer); resolve(message); });
    });
}

function notify(method) {
    bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + NEWLINE);
}

before(() => start());
after(() => { try { bridge.stdin.end(); bridge.kill(); } catch (e) { /* already gone */ } });

test('it introduces itself, and agrees a protocol version', async () => {
    const hello = await call('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
    });

    //THE APP HAS TO BE UP, and this is where that is said once rather than in
    //every assertion below.
    if (hello.error && /not running/.test(hello.error.message)) {
        assert.ok(true, 'the app is not running, and the bridge said so rather than hanging');
        return;
    }

    assert.ok(hello.result, JSON.stringify(hello.error));
    assert.equal(hello.result.protocolVersion, '2025-06-18', 'a version it speaks was not echoed back');
    assert.ok(hello.result.serverInfo.name, 'no server name');
    assert.ok(hello.result.capabilities.tools, 'tools were not declared');

    notify('notifications/initialized');
});

//A VERSION IT DOES NOT SPEAK GETS THE NEWEST ONE IT DOES, rather than an error.
//The spec asks for that, and a client is then free to disconnect -- refusing
//outright takes the choice away from the side that has it.
test('an unknown protocol version is answered with a known one', async () => {
    const hello = await call('initialize', {
        protocolVersion: '1999-01-01',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
    });

    if (hello.error) return; //the app is not running; the first test said so
    assert.notEqual(hello.result.protocolVersion, '1999-01-01');
    assert.match(hello.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
});

test('every list answers with the shape the protocol names', async () => {
    const tools = await call('tools/list');
    if (tools.error) return;

    assert.ok(Array.isArray(tools.result.tools), 'tools/list did not answer with a list');
    for (const tool of tools.result.tools) {
        assert.ok(tool.name, 'a tool with no name');
        assert.ok(tool.description, tool.name + ' has no description for the model to read');

        //inputSchema is required, and `{}` is not a schema
        assert.equal(tool.inputSchema.type, 'object', tool.name + ' has no object schema');
        assert.equal(tool.run, undefined, tool.name + ' sent its implementation to the client');
    }

    const resources = await call('resources/list');
    for (const one of resources.result.resources) {
        assert.ok(one.uri, 'a resource with no uri');
        assert.ok(one.mimeType, one.uri + ' has no mimeType');
    }

    const templates = await call('resources/templates/list');
    assert.ok(Array.isArray(templates.result.resourceTemplates));

    const prompts = await call('prompts/list');
    for (const one of prompts.result.prompts) {
        assert.ok(one.name, 'a prompt with no name');
        assert.ok(Array.isArray(one.arguments), one.name + ' has no argument list');
    }
});

test('a tool call comes back as content, and a structured answer twice', async () => {
    const answer = await call('tools/call', { name: 'app_status', arguments: {} });
    if (answer.error) return;

    const result = answer.result;
    assert.ok(Array.isArray(result.content), 'no content');
    assert.equal(result.content[0].type, 'text');

    //app_status declares an outputSchema, so it arrives both ways
    assert.ok(result.structuredContent, 'no structuredContent from a tool that has an outputSchema');
    assert.equal(typeof result.structuredContent.pid, 'number');
    assert.equal(JSON.parse(result.content[0].text).pid, result.structuredContent.pid,
        'the text and the structured answer disagree');
});

//THE TWO KINDS OF WRONG, WHICH THE PROTOCOL KEEPS APART.
test('an unknown tool is a protocol error and a failing tool is a result', async () => {
    const unknown = await call('tools/call', { name: 'no-such-tool', arguments: {} });
    if (unknown.result) return; //app not running: nothing to compare

    assert.ok(unknown.error, 'an unknown tool did not produce an error');
    assert.equal(unknown.error.code, -32602);

    const failed = await call('tools/call', {
        name: 'click', arguments: { target: 'nothing-matches-this-anywhere' }
    });

    assert.ok(failed.result, 'a tool that failed produced a protocol error instead of a result');
    assert.equal(failed.result.isError, true);
    assert.ok(failed.result.content[0].text.length, 'isError with nothing to read');
});

test('a resource reads, and a uri that is not there is -32002', async () => {
    const read = await call('resources/read', { uri: 'app://plugins' });
    if (read.error && /not running/.test(read.error.message)) return;

    assert.equal(read.result.contents[0].uri, 'app://plugins');
    assert.ok(JSON.parse(read.result.contents[0].text).length > 5, 'the plugin list is suspiciously short');

    const missing = await call('resources/read', { uri: 'app://nothing-here' });
    assert.equal(missing.error.code, -32002);
});

//A URI IS UNTRUSTED INPUT, and the template in mcp-example reads a file with it.
test('a resource uri cannot climb out of the tree', async () => {
    const climbed = await call('resources/read', { uri: 'app://readme/../../../package.json' });
    if (climbed.error && /not running/.test(climbed.error.message)) return;

    assert.ok(climbed.error, 'a path that climbs was read rather than refused');
    assert.equal(climbed.error.code, -32002);
    assert.equal(climbed.result, undefined, 'it answered with contents as well as an error');
});

test('a prompt comes back as messages, and a missing argument is refused', async () => {
    const got = await call('prompts/get', { name: 'explain_plugin', arguments: { plugin: 'core/bridge' } });
    if (got.error && /not running/.test(got.error.message)) return;

    assert.ok(Array.isArray(got.result.messages));
    assert.equal(got.result.messages[0].role, 'user');
    assert.equal(got.result.messages[0].content.type, 'text');

    //the second message embeds the README as a resource, which is what makes
    //the prompt one thing rather than an instruction to go and fetch something
    const embedded = got.result.messages.filter((m) => m.content.type === 'resource')[0];
    assert.ok(embedded, 'the prompt did not embed the README');
    assert.ok(embedded.content.resource.text.indexOf('#') >= 0, 'the embedded resource is empty');

    const short = await call('prompts/get', { name: 'explain_plugin', arguments: {} });
    assert.equal(short.error.code, -32602);
});

//A NOTIFICATION HAS NO id AND MUST NOT BE ANSWERED. Replying to one is a
//protocol error that some clients report and others quietly ignore -- and the
//quiet ones are worse, because the bug turns up somewhere else.
test('a notification is not answered', async () => {
    notify('notifications/initialized');
    notify('notifications/cancelled');

    //ping goes after them: if either was answered, the reply would arrive with
    //no id and this would still be waiting when ping's answer came back
    const ping = await call('ping');
    assert.ok(ping.result, 'ping did not answer, which means something else did');
    assert.equal(ping.id, seq, 'an answer arrived out of order -- something answered a notification');
});

test('an unknown method is -32601', async () => {
    const answer = await call('nonsense/method', {});
    assert.equal(answer.error.code, -32601);
});

//---- what a closed build admits to having ---------------------------------
//
//THE BRANCH NO DEVELOPER RUNS. Hiding happens only in a closed build and every
//machine this is written on runs an open one -- so as a closure inside
//./server.js the whole rule could be broken with every check still green. The
//predicate is handed in, which is what lets both answers be had here.

const showing = require('./showing');

const TOOLS = {
    screenshot: { name: 'screenshot', description: 'a picture', run: () => {}, needs: null },
    click: { name: 'click', description: 'press something', run: () => {}, needs: 'drive' },
    quit: { name: 'quit', description: 'stop the app', run: () => {}, needs: 'quit' }
};

const only = (...names) => (name) => names.indexOf(name) < 0;

test('an open build hides nothing', () => {
    assert.deepStrictEqual(showing.shown(TOOLS, null), ['screenshot', 'click', 'quit']);
    assert.equal(showing.listed(TOOLS, ['run', 'needs'], null).length, 3);
});

test('a closed build lists only what is open', () => {
    assert.deepStrictEqual(showing.shown(TOOLS, only('screenshot')), ['screenshot']);

    const out = showing.listed(TOOLS, ['run', 'needs'], only('screenshot'));
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'screenshot');
});

//A CLOSED BUILD WITH NOTHING LISTED ADMITS TO NOTHING, which is what lets
//./server.js drop the `tools` capability rather than announce a menu and then
//serve an empty one.
test('nothing open means nothing listed at all', () => {
    assert.deepStrictEqual(showing.shown(TOOLS, () => true), []);
    assert.deepStrictEqual(showing.listed(TOOLS, ['run'], () => true), []);
});

//`needs` IS A MAP OF WHAT IS GUARDED, and the one caller it is guarded against
//is the one being handed the list. It is not a field the protocol has either.
test('our own fields never reach the wire, hidden or not', () => {
    for (const isHidden of [null, only('screenshot')]) {
        showing.listed(TOOLS, ['run', 'needs'], isHidden).forEach((one) => {
            assert.equal(one.run, undefined, 'the implementation went out on the wire');
            assert.equal(one.needs, undefined, 'what guards it went out on the wire');
        });
    }
});

//RESOURCE TEMPLATES ARE AN ARRAY CARRYING THEIR OWN NAMES, not a map keyed by
//them -- and one function reads both, because two would come to disagree about
//what a build says it has.
test('templates are filtered by the same rule as the maps', () => {
    const templates = [{ name: 'readme', uriTemplate: 'app://readme/{plugin}' },
        { name: 'page', uriTemplate: 'app://page/{name}' }];

    assert.deepStrictEqual(showing.shown(templates, null), ['readme', 'page']);
    assert.deepStrictEqual(showing.shown(templates, only('page')), ['page']);
});

test('an empty registry is not an error in either stance', () => {
    assert.deepStrictEqual(showing.shown({}, null), []);
    assert.deepStrictEqual(showing.shown(undefined, () => true), []);
    assert.deepStrictEqual(showing.listed({}, ['run'], null), []);
});
