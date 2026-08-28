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

//THE REQUIRE IS GATED, NOT JUST THE CALL -- the same rule ../../app/core/io
//follows, and for the same measured reason: webpack collects a dependency
//wherever it can reach it, so `mount(...)` behind a constant would still drag
//./http.js and express's json parser into a binary built with
//"canServe": false, while the README claimed the routes were gone.
var mountHttp = null;
if (BUILD_SERVABLE) mountHttp = require('./http');

//`http` IS NOT A SERVICE IN THIS CONTEXT. It is provided by core/http/main.js,
//which runs on nw's node side; this half is the bundle, and what it gets is
//`app.host` -- the router to mount on and a forwarded view of whether anything
//is being served. Consuming 'http' here fails the graph outright with "nothing
//provides: http (wanted by mcp/server.js)", which is at least an honest error.
//---- and what a model is allowed to do with any of it ----------------------
//
//THIS IS THE ONE DOOR THE APP OPENS TO A MODEL ON PURPOSE, which is what makes
//guarding it mean something. The header above says this adds no new surface --
//everything is answered over the control socket the cli already uses -- and that
//is true of the TRANSPORT and beside the point for the CALLER. Anything with a
//shell can already run `node src/cli.js quit`, and ../../app/core/may says
//plainly that it cannot protect against a shell. A model reaching in over MCP
//has no shell: it has exactly the tools listed here, and this is where that list
//stops being a list of things it may simply take.
//
//A TOOL SAYS `needs: '<capability>'` AND THAT IS THE WHOLE OF IT. No plugin has
//to consume `may`, call it, or interpret the answer -- the registry does it, so
//the guard cannot be forgotten at the call site while the tool still looks
//guarded in the listing.
var showing = require('./showing');

plugin.consumes = ['ipc', 'appPackage', 'app', 'Plugin', 'may'];
plugin.provides = ['mcp'];
async function plugin(imports, register) {
    var ipc = imports.ipc;
    var may = imports.may;
    var self = new imports.Plugin('mcp');

    //DECLARED BY WANTING IT, so `needs` alone is enough. A tool that named a
    //capability nobody had declared would be silently ungoverned -- `may` allows
    //what nothing guards -- which is the worst possible reading of a field whose
    //entire purpose is to say "ask about this".
    //
    //AN EXISTING DECLARATION WINS. `snapshot` is ../../app/debug-snapshot's and
    //carries its own sentence for the dialog; re-declaring would replace that
    //with whatever this tool's description happens to say, and `declare` has no
    //notion of two owners.
    //THE SENTENCE IN THE DIALOG COMES FROM THE TOOL, because the alternative is
    //a person being asked "Allow mcp:screen?" with nothing under it. The tool
    //already has to explain itself to a model; the same words are the closest
    //thing to hand, and a wrong-but-real sentence beats a right-but-empty one.
    function guard(needs, about) {
        if (!needs || may.asks(needs)) return function () { };

        return may.declare(needs, {
            about: 'Something reaching this app over MCP asked to do this.'
                + (about ? ' It says: ' + about : '')
        });
    }

    //ASKED AT THE CALL, WITH WHERE THE CALL CAME FROM.
    //
    //An MCP call arrives over ../../app/core/ipc, which stamps `overTheWire` --
    //so this is never a person, and ../../app/core/may raises the question in
    //the window rather than refusing outright. That is the shape the whole thing
    //is for: the model gets a way to ASK, and somebody who is actually sitting
    //there answers.
    async function allowed(needs, from) {
        if (!needs) return null;

        var said = await may(needs, { from: from || { overTheWire: true } });
        if (said.allowed) return null;

        //A REFUSAL IS A RESULT, NOT A PROTOCOL ERROR -- the same distinction the
        //call handler already makes for a tool that threw. The model is supposed
        //to read this and do something else, and "nobody allowed it" is exactly
        //the kind of thing it can act on.
        return said.why || 'nobody allowed ' + needs;
    }

    var tools = {};
    var resources = {};
    var templates = [];
    var prompts = {};

    //A NAME IS A KEY, NOT A LABEL. Registering the same name twice replaces it
    //rather than stacking two, for the same reason ../../app/ui/banner does:
    //this half is rebuilt on every save, and a plugin that registered on load
    //would otherwise offer three copies of one tool by lunchtime.
    //SAID IN THE DESCRIPTION, because that is the only place a model reads.
    //
    //A GUARDED TOOL THAT LOOKS LIKE ANY OTHER gets called, waits while somebody
    //is asked, and may come back refused -- and from the model's side that is
    //indistinguishable from a broken tool. One sentence turns it into a thing it
    //can plan around: ask first, or do the part it does not need permission for.
    function saying(text, needs, doing) {
        if (!needs) return text || '';
        return (text ? text + ' ' : '') + 'A person at the window is asked before this ' + doing + '.';
    }

    function tool(name, spec) {
        spec = spec || {};
        if (typeof spec.run != 'function') throw new Error('the tool "' + name + '" has nothing to run');

        tools[name] = {
            name: name,
            title: spec.title,
            description: saying(spec.description, spec.needs, 'runs'),

            //MCP CALLS THIS inputSchema AND IT IS NOT OPTIONAL. A tool with no
            //arguments still declares an empty object schema -- a client that
            //gets no schema has no way to know that "none" was the answer
            //rather than an omission.
            inputSchema: spec.inputSchema || { type: 'object', properties: {} },
            outputSchema: spec.outputSchema,
            annotations: spec.annotations,

            //WHAT A PERSON HAS TO AGREE TO BEFORE THIS RUNS, if anything.
            needs: spec.needs || null,
            run: spec.run
        };

        var undeclare = guard(spec.needs, spec.description);
        var gone = remover(tools, name);

        return { name: gone.name, remove: function () { gone.remove(); undeclare(); } };
    }

    function resource(uri, spec) {
        spec = spec || {};
        if (typeof spec.read != 'function') throw new Error('the resource "' + uri + '" cannot be read');

        resources[uri] = {
            uri: uri,
            name: spec.name || uri,
            title: spec.title,
            description: saying(spec.description, spec.needs, 'is read'),
            mimeType: spec.mimeType || 'text/plain',

            //A RESOURCE IS READ RATHER THAN RUN, AND THAT IS NOT SAFER. What
            //comes back goes to the model exactly as a tool's answer does --
            //`app://log` is the app's own log -- so it takes the same field.
            needs: spec.needs || null,
            read: spec.read
        };

        var undeclare = guard(spec.needs, spec.description);
        var gone = remover(resources, uri);

        return { name: gone.name, remove: function () { gone.remove(); undeclare(); } };
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
            needs: spec.needs || null,
            match: spec.match,
            read: spec.read
        });

        guard(spec.needs, spec.description);
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

    //---- and what a closed build does not admit exists ---------------------
    //
    //HIDDEN, NOT REFUSED, and that is the one place this differs from the
    //command line. ../../app/core/ipc refuses a wire call with a sentence
    //naming the config key, because whoever is at a terminal has a token and a
    //file to read anyway. THIS is the surface a model arrives on with nothing
    //but the list -- and the note at the top of this file already says the tool
    //list "is where that list stops being a list of things it may simply take".
    //A tool a model cannot see is one it cannot be talked into trying, and one
    //that cannot turn up in a description somebody else wrote.
    //
    //LISTING AND CALLING AGREE, which is the part that has to be right:
    //`tools/list` leaves it out and calling it by name answers `unknown`, the
    //same as a tool nobody ever registered. A door that is invisible from one
    //side and answers from the other is not hidden, it is a guessing game.
    function hidden(kind, name) { return !!may.reaches(kind, name); }

    //THE FILTER AND THE SCRUB ARE IN ./showing.js, and the predicate is what
    //this file adds. That is not tidying: hiding happens ONLY in a closed build,
    //and every machine this is developed on runs an open one -- as a closure in
    //here the whole rule could be broken with every check still green. Handed a
    //predicate, ./node.test.js sees both answers with no app.
    function by(kind) {
        return kind ? function (name) { return hidden(kind, name); } : null;
    }

    function listed(map, drop, kind) { return showing.listed(map, drop, by(kind)); }
    function shown(map, kind) { return showing.shown(map, by(kind)); }

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
                //AND COUNTED AFTER THE HIDING, not before. Announcing `tools`
                //and then listing none is a client showing an empty menu and
                //wondering what it did wrong -- the same failure this block was
                //written for, one layer along.
                capabilities: {
                    tools: shown(tools, 'tools').length ? {} : undefined,
                    resources: (shown(resources, 'resources').length
                        || shown(templates, 'resources').length) ? {} : undefined,
                    prompts: shown(prompts, 'prompts').length ? {} : undefined
                },

                //`needs` IS OURS AND DOES NOT GO ON THE WIRE. It is not a field
                //MCP has, and a client that validates what it is sent would be
                //right to reject it. What a model actually needs to know is in
                //the DESCRIPTION -- see `tool` above, which says so in a
                //sentence rather than in a field nobody's schema knows.
                tools: listed(tools, ['run', 'needs'], 'tools'),
                resources: listed(resources, ['read', 'needs'], 'resources'),

                //A TEMPLATE IS A RESOURCE NOBODY LISTED, which is what makes it
                //the easy one to leave open -- `app://readme/{plugin}` reads a
                //file off disk by name. It is gated under `resources` by the
                //template's own name, because that is the only handle it has.
                resourceTemplates: templates.filter(function (one) {
                    return !hidden('resources', one.name);
                }).map(function (one) {
                    var copy = Object.assign({}, one);
                    delete copy.read; delete copy.match; delete copy.needs;
                    Object.keys(copy).forEach(function (f) { if (copy[f] === undefined) delete copy[f]; });
                    return copy;
                }),
                prompts: listed(prompts, ['get'], 'prompts')
            };
        }),

        //A TOOL THAT THROWS IS NOT A PROTOCOL ERROR. MCP separates the two:
        //an unknown tool is the client's mistake and gets a JSON-RPC error;
        //a tool that ran and failed is a RESULT with isError, because the model
        //is supposed to see what went wrong and try something else. The
        //distinction is made here, where the difference is known.
        ipc.handle('mcp:call', async function (data, from) {
            data = data || {};
            //THE SAME ANSWER AS A TOOL NOBODY REGISTERED, on purpose. It is
            //missing from `tools/list` too, and a name that answers differently
            //from a nonsense one is a list anybody can work around by guessing.
            var found = hidden('tools', data.name) ? null : tools[data.name];
            if (!found) return { unknown: true };

            //BEFORE IT RUNS, NOT AFTER. A tool that has already photographed the
            //screen and is then told no has done the thing.
            var no = await allowed(found.needs, from);
            if (no) return { result: { content: [{ type: 'text', text: no }], isError: true } };

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

        ipc.handle('mcp:read', async function (data, from) {
            data = data || {};
            var uri = String(data.uri || '');
            var found = hidden('resources', uri) ? null : resources[uri];

            //a listed resource first, then anything a template claims
            if (!found) {
                var shape = templates.filter(function (one) {
                    return typeof one.match == 'function' && one.match(uri)
                        && !hidden('resources', one.name);
                })[0];
                //THE SHAPE'S `needs` COMES WITH IT. A template is a resource
                //nobody listed, which makes it the easy one to leave open --
                //`app://readme/{plugin}` reads a file off disk by name.
                if (shape) {
                    found = {
                        uri: uri, mimeType: shape.mimeType, needs: shape.needs || null,
                        read: function () { return shape.read(uri); }
                    };
                }
            }

            if (!found) return { unknown: true };

            //REFUSED AS A REFUSAL, NOT AS "NOT FOUND". The two below are
            //deliberately the same answer -- a uri that is not there -- and this
            //is a different thing: the uri exists and somebody said no. Folding
            //it into `unknown` would tell a model to stop asking about something
            //it may be allowed to have in a moment.
            var no = await allowed(found.needs, from);
            if (no) return { refused: no };

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
            var found = hidden('prompts', data.name) ? null : prompts[data.name];
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

    //---- the second transport ------------------------------------------------
    //
    //THE STDIO BRIDGE IS THE ONE TO PREFER and it needs nothing from here --
    //tools/mcp.js reaches the same four commands over the control socket. This
    //is for a client that cannot launch a process, and it is a LISTENING
    //surface, so it sits behind the browser viewer's own switch: mounted here,
    //refused with a reason while `http.serving` is off, and absent entirely
    //from a build that cannot serve.
    if (mountHttp) {
        var at = mountHttp(imports.app.host, ipc, {
            instructions: 'These tools drive a running desktop app. `screenshot` is the ' +
                'only way to see what it looks like -- prefer it to guessing.'
        });

        //said once, at boot, rather than on every request: the url is only
        //true while something is listening, and the point of the line is that
        //somebody reading the log knows the endpoint exists at all
        console.log('mcp: also on ' + at + ' when the browser viewer is on');
    }

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
