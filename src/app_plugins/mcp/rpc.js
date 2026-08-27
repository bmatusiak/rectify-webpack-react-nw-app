//THE PROTOCOL, ONCE, FOR BOTH TRANSPORTS.
//
//../../../tools/mcp.js speaks it on stdin and stdout to a client that launched
//it; ./http.js speaks it over the app's own http server to a client that
//cannot launch a process. Everything between "a JSON-RPC message arrived" and
//"here is the answer" is the same in both, and the version of this file that
//had it written twice lasted about an hour before the two disagreed about what
//`resources/read` does with a uri nobody registered.
//
//SO A TRANSPORT SUPPLIES ONE FUNCTION -- `ask(command, data)`, which reaches
//./server.js somehow -- and gets back something that turns a message into a
//reply. Over stdio that ask goes down a socket; over http it is `ipc.invoke`
//in the same process. Neither one knows which methods exist.
//
//WHAT THIS IS NOT is an MCP library. It answers the methods this app offers and
//no others, the same discipline as ../../app/core/bridge/main.js's shim over
//socket.io: what is here is what is used.

var JSONRPC = '2.0';

//THE VERSIONS THIS SPEAKS, newest first. A client asks for one; if it is on the
//list it gets it back, and if it is not it gets the newest here rather than a
//refusal -- the spec puts that choice on the client, which is the side that
//knows whether it can carry on.
var SPOKEN = ['2025-06-18', '2025-03-26', '2024-11-05'];

//-32601 unknown method, -32602 bad params, -32603 something broke in here,
//-32002 the resource is not there. The numbers are the spec's.
function error(id, code, message, data) {
    var body = data ? { code: code, message: message, data: data } : { code: code, message: message };
    return { jsonrpc: JSONRPC, id: id, error: body };
}

function result(id, value) {
    return { jsonrpc: JSONRPC, id: id, result: value };
}

module.exports = function rpc(ask, options) {
    options = options || {};

    var METHODS = {
        initialize: async function (params, id) {
            var wanted = (params && params.protocolVersion) || SPOKEN[0];
            var described = await ask('mcp:describe');

            return result(id, {
                protocolVersion: SPOKEN.indexOf(wanted) >= 0 ? wanted : SPOKEN[0],
                capabilities: described.capabilities,
                serverInfo: described.serverInfo,

                //instructions are read by the MODEL rather than shown in a menu,
                //so this says the thing a tool list cannot: that looking is
                //possible and preferable to guessing
                instructions: options.instructions ||
                    'These tools drive a running desktop app. `screenshot` is the only way to ' +
                    'see what it looks like -- prefer it to guessing, and read app://plugins ' +
                    'before answering questions about how the app is built.'
            });
        },

        'tools/list': async function (params, id) {
            return result(id, { tools: (await ask('mcp:describe')).tools });
        },

        'tools/call': async function (params, id) {
            var answer = await ask('mcp:call', {
                name: params && params.name,
                arguments: (params && params.arguments) || {}
            });

            //AN UNKNOWN TOOL IS A PROTOCOL ERROR AND A FAILING TOOL IS NOT.
            //./server.js makes that distinction because it is the side that
            //knows; this only carries it. Backwards, a model either cannot see
            //why its call failed or treats a typo as something to retry.
            if (answer.unknown) return error(id, -32602, 'Unknown tool: ' + (params && params.name));
            return result(id, answer.result);
        },

        'resources/list': async function (params, id) {
            return result(id, { resources: (await ask('mcp:describe')).resources });
        },

        'resources/templates/list': async function (params, id) {
            return result(id, { resourceTemplates: (await ask('mcp:describe')).resourceTemplates });
        },

        'resources/read': async function (params, id) {
            var answer = await ask('mcp:read', { uri: params && params.uri });

            if (answer.unknown) {
                return error(id, -32002, answer.why || 'Resource not found', { uri: params && params.uri });
            }

            //REFUSED IS NOT NOT-FOUND. -32002 tells a client the uri does not
            //exist, which invites it to stop asking; this one exists and
            //somebody said no, and it may be allowed a minute from now.
            //-32001 is unassigned in the protocol's reserved range, so it is
            //readable as "this server refused" without pretending to be one of
            //MCP's own numbers.
            if (answer.refused) {
                return error(id, -32001, answer.refused, { uri: params && params.uri });
            }

            return result(id, { contents: answer.contents });
        },

        'prompts/list': async function (params, id) {
            return result(id, { prompts: (await ask('mcp:describe')).prompts });
        },

        'prompts/get': async function (params, id) {
            var answer = await ask('mcp:prompt', {
                name: params && params.name,
                arguments: (params && params.arguments) || {}
            });

            if (answer.unknown) return error(id, -32602, 'Unknown prompt: ' + (params && params.name));
            if (answer.missing) return error(id, -32602, 'Missing required arguments: ' + answer.missing.join(', '));

            return result(id, { description: answer.description, messages: answer.messages });
        },

        //answers without the app, because it is how a client checks the
        //transport itself is alive
        ping: function (params, id) { return result(id, {}); }
    };

    return {
        methods: Object.keys(METHODS),

        //ONE MESSAGE IN, ONE REPLY OUT, OR NOTHING.
        //
        //`null` means "say nothing back", which is what a notification gets: a
        //message with no id must not be answered, and replying to one is a
        //protocol error that some clients report and others quietly ignore --
        //the quiet ones being worse, because the fault turns up elsewhere.
        handle: async function (message) {
            if (!message || message.id === undefined || message.id === null) return null;

            var run = METHODS[message.method];
            if (!run) return error(message.id, -32601, 'Method not found: ' + message.method);

            try {
                return await run(message.params, message.id);
            } catch (e) {
                return error(message.id, -32603, (e && e.message) || String(e));
            }
        }
    };
};

module.exports.SPOKEN = SPOKEN;
module.exports.JSONRPC = JSONRPC;
