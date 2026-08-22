//WHAT A PLUGIN REGISTERS, AND WHAT THE BRIDGE ASKS FOR.
//
//The protocol itself is not here. This half holds the three registries an MCP
//server offers -- tools, resources, prompts -- and answers four ipc commands
//with them; tools/mcp.js turns that into JSON-RPC on stdin and stdout. The cut
//is deliberate: a plugin that wants to offer a tool should not have to know
//what a JSON-RPC envelope looks like, and the transport should not have to know
//what this app can do.
//
//OPT IN, NOT REFLECT. The obvious other way is to expose `ipc.commands()` --
//the app already lists fourteen of them, with help text and argument names, and
//a dozen lines here would turn that into a tool list for free. It would also
//hand an agent `quit`, `hide`, and `serve`, because they are in the same list;
//and MCP wants a description and a JSON schema, which `help: 'is the app up'`
//and `args: ['path']` are not. So a tool is something a plugin says out loud.
//
//IT ADDS NO NEW SURFACE, and that is worth stating plainly. Everything here is
//answered over ../../app/core/ipc -- the control socket the cli already uses --
//so anything that can reach this can already run `node src/cli.js quit`. The
//http transport is the one that opens something, which is why it is gated by
//../../app/core/http's `serving` switch rather than by this.

plugin.consumes = ['ipc', 'appPackage', 'Plugin'];
plugin.provides = ['mcp'];
async function plugin(imports, register) {
    var ipc = imports.ipc;
    var self = new imports.Plugin('mcp');

    var tools = {};
    var resources = {};
    var templates = [];
    var prompts = {};

    //A NAME IS A KEY, NOT A LABEL. Registering the same name twice replaces it
    //rather than stacking two, for the same reason ../../app/ui/banner does:
    //this half is rebuilt on every save, and a plugin that registered on load
    //would otherwise offer three copies of one tool by lunchtime.
    function tool(name, spec) {
        spec = spec || {};
        if (typeof spec.run != 'function') throw new Error('the tool "' + name + '" has nothing to run');

        tools[name] = {
            name: name,
            title: spec.title,
            description: spec.description || '',

            //MCP CALLS THIS inputSchema AND IT IS NOT OPTIONAL. A tool with no
            //arguments still declares an empty object schema -- a client that
            //gets no schema has no way to know that "none" was the answer
            //rather than an omission.
            inputSchema: spec.inputSchema || { type: 'object', properties: {} },
            outputSchema: spec.outputSchema,
            annotations: spec.annotations,
            run: spec.run
        };

        return remover(tools, name);
    }

    function resource(uri, spec) {
        spec = spec || {};
        if (typeof spec.read != 'function') throw new Error('the resource "' + uri + '" cannot be read');

        resources[uri] = {
            uri: uri,
            name: spec.name || uri,
            title: spec.title,
            description: spec.description,
            mimeType: spec.mimeType || 'text/plain',
            read: spec.read
        };

        return remover(resources, uri);
    }

    //A TEMPLATE IS A SHAPE, NOT A THING. `resources/templates/list` is how a
    //client learns it may ask for a uri nobody listed -- app://page/{name} --
    //and the read side is an ordinary resource whose uri happened to match.
    function template(uriTemplate, spec) {
        spec = spec || {};
        templates.push({
            uriTemplate: uriTemplate,
            name: spec.name || uriTemplate,
            title: spec.title,
            description: spec.description,
            mimeType: spec.mimeType,
            match: spec.match,
            read: spec.read
        });
        var at = templates.length - 1;
        return { name: uriTemplate, remove: function () { templates.splice(at, 1); } };
    }

    function prompt(name, spec) {
        spec = spec || {};
        if (typeof spec.get != 'function') throw new Error('the prompt "' + name + '" has nothing to give');

        prompts[name] = {
            name: name,
            title: spec.title,
            description: spec.description || '',
            arguments: spec.arguments || [],
            get: spec.get
        };

        return remover(prompts, name);
    }

    //WHAT IS REGISTERED CAN BE WITHDRAWN, which the ipc handles and the tray
    //items beside it already do. Two things need it: a plugin that offers a
    //tool only while something is true, and a TEST -- which registers against
    //the running app's real service, and would otherwise leave `probe_tool` in
    //the offering of an app somebody is using.
    function remover(map, key) {
        return { name: key, remove: function () { delete map[key]; } };
    }

    //---- what the bridge asks for --------------------------------------------
    //
    //Four commands, and none of them speak JSON-RPC: the shapes below are the
    //protocol's, so tools/mcp.js is an envelope and a socket rather than a
    //second implementation of everything above.

    function listed(map, drop) {
        return Object.keys(map).sort().map(function (key) {
            var copy = Object.assign({}, map[key]);
            drop.forEach(function (field) { delete copy[field]; });

            //undefined fields are omitted rather than sent as null, because a
            //client reading `title: null` has to decide what that means
            Object.keys(copy).forEach(function (field) {
                if (copy[field] === undefined) delete copy[field];
            });

            return copy;
        });
    }

    var handlers = [
        ipc.handle('mcp:describe', function () {
            return {
                serverInfo: {
                    name: imports.appPackage.name,
                    title: imports.appPackage.title,
                    version: imports.appPackage.version
                },

                //DECLARED FROM WHAT IS ACTUALLY REGISTERED. Announcing `tools`
                //when nothing registered one makes a client show an empty menu
                //and wonder what it did wrong.
                capabilities: {
                    tools: Object.keys(tools).length ? {} : undefined,
                    resources: (Object.keys(resources).length || templates.length) ? {} : undefined,
                    prompts: Object.keys(prompts).length ? {} : undefined
                },

                tools: listed(tools, ['run']),
                resources: listed(resources, ['read']),
                resourceTemplates: templates.map(function (one) {
                    var copy = Object.assign({}, one);
                    delete copy.read; delete copy.match;
                    Object.keys(copy).forEach(function (f) { if (copy[f] === undefined) delete copy[f]; });
                    return copy;
                }),
                prompts: listed(prompts, ['get'])
            };
        }),

        //A TOOL THAT THROWS IS NOT A PROTOCOL ERROR. MCP separates the two:
        //an unknown tool is the client's mistake and gets a JSON-RPC error;
        //a tool that ran and failed is a RESULT with isError, because the model
        //is supposed to see what went wrong and try something else. The
        //distinction is made here, where the difference is known.
        ipc.handle('mcp:call', async function (data) {
            data = data || {};
            var found = tools[data.name];
            if (!found) return { unknown: true };

            try {
                var answer = await found.run(data.arguments || {});
                return { result: asResult(answer, found) };
            } catch (e) {
                return {
                    result: {
                        content: [{ type: 'text', text: String((e && e.message) || e) }],
                        isError: true
                    }
                };
            }
        }),

        ipc.handle('mcp:read', async function (data) {
            data = data || {};
            var uri = String(data.uri || '');
            var found = resources[uri];

            //a listed resource first, then anything a template claims
            if (!found) {
                var shape = templates.filter(function (one) {
                    return typeof one.match == 'function' && one.match(uri);
                })[0];
                if (shape) found = { uri: uri, mimeType: shape.mimeType, read: function () { return shape.read(uri); } };
            }

            if (!found) return { unknown: true };

            //A READ THAT REFUSES IS STILL "NOT FOUND", not "the app broke".
            //`app://readme/nonsense` and `app://readme/../../etc/passwd` both
            //land here, and both are the client asking for something that is
            //not there -- which the protocol numbers -32002. Letting the throw
            //through would make them -32603, which says the server is faulty.
            var body;
            try { body = await found.read(uri); }
            catch (e) { return { unknown: true, why: (e && e.message) || String(e) }; }
            var one = { uri: uri, mimeType: found.mimeType || 'text/plain' };

            //TEXT OR BLOB, NEVER BOTH. A reader that hands back a Buffer means
            //binary, and base64 is how the protocol carries it.
            if (body && typeof body == 'object' && body.blob) {
                one.blob = body.blob;
                if (body.mimeType) one.mimeType = body.mimeType;
            } else {
                one.text = typeof body == 'string' ? body : JSON.stringify(body, null, 2);
            }

            return { contents: [one] };
        }),

        ipc.handle('mcp:prompt', async function (data) {
            data = data || {};
            var found = prompts[data.name];
            if (!found) return { unknown: true };

            var missing = found.arguments.filter(function (one) {
                return one.required && !(data.arguments && data.arguments[one.name]);
            });
            if (missing.length) return { missing: missing.map(function (one) { return one.name; }) };

            var messages = await found.get(data.arguments || {});

            return {
                description: found.description,
                messages: [].concat(messages).map(function (message) {
                    //a plain string is the common case and means "the user said
                    //this", so it is written that way rather than made verbose
                    if (typeof message == 'string') message = { role: 'user', text: message };
                    return {
                        role: message.role || 'user',
                        content: message.content || { type: 'text', text: String(message.text) }
                    };
                })
            };
        })
    ];

    //A TOOL MAY ANSWER WITH A STRING, AN OBJECT, OR THE PROTOCOL'S OWN SHAPE.
    //The last is what a tool returning an image needs; the first two are what
    //nearly every tool actually wants, so they are not made to spell it out.
    //
    //An object answer is sent BOTH ways -- structuredContent for a client that
    //understands it, and the same json as text for one that does not, which is
    //what the spec asks for and what makes a tool readable in a chat log.
    function asResult(answer, found) {
        if (answer && answer.content) return answer;

        if (typeof answer == 'string') return { content: [{ type: 'text', text: answer }] };

        var text = JSON.stringify(answer, null, 2);
        var result = { content: [{ type: 'text', text: text }] };

        //structuredContent is only meaningful against an outputSchema, and
        //sending it without one gives a validating client nothing to check
        if (found.outputSchema) result.structuredContent = answer;
        return result;
    }

    //`ipc.handle` hands back a handle with `.remove()`, not a function -- and
    //this half is rebuilt on every save, so a handler left behind is a second
    //copy answering the next call. Same reason ../../app/core/io/server.js
    //takes its listeners off.
    self.own(function () {
        handlers.forEach(function (handle) {
            try { handle.remove(); } catch (e) { /* already gone */ }
        });
    });

    await register(null, {
        mcp: self.api({
            tool: tool,
            resource: resource,
            template: template,
            prompt: prompt,

            //what is registered right now, for anything that wants to say so on
            //screen -- the demo's System page, a test, a log line
            get offering() {
                return {
                    tools: Object.keys(tools).sort(),
                    resources: Object.keys(resources).sort(),
                    templates: templates.map(function (one) { return one.uriTemplate; }),
                    prompts: Object.keys(prompts).sort()
                };
            }
        }),
        onDestroy: self.unload
    });
}
module.exports = plugin;
