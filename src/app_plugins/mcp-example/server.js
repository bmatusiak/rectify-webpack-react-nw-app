var fs = require('fs');
var os = require('os');
var path = require('path');

//WHAT AN MCP SERVER CAN OFFER, ALL OF IT, AGAINST A REAL APP.
//
//../mcp holds the registries and answers the bridge; this registers things in
//them. It is a separate plugin on purpose -- the service is the scaffold's, the
//offering is the app's, and deleting this folder leaves an MCP server with
//nothing to say rather than a broken one.
//
//NOTHING HERE IS A MOCK, which is the same choice ../../app/demo makes. The
//tools drive the real window, the resources read the real plugin graph and the
//real log, and the screenshot is a picture of what is on screen right now. A
//fixture would demonstrate the shapes and prove nothing about the app.
//
//THE THREE SURFACES, AND WHY A THING IS ONE RATHER THAN ANOTHER:
//
//  a TOOL is something the model may decide to DO -- it acts, it can fail, and
//  a human should be able to see it happen. Reading the screen is a tool
//  because it is a question about a moment.
//
//  a RESOURCE is something to READ INTO CONTEXT. It has a uri, it is stable
//  enough to be worth naming, and asking for it twice is not an event.
//
//  a PROMPT is something the USER picks -- a slash command with the awkward
//  parts already written. Not something a model chooses.

plugin.consumes = ['mcp', 'ipc', 'app', 'appPackage', 'window'];
plugin.provides = [];
async function plugin(imports, register) {
    var { mcp, ipc, app, appPackage, window: win } = imports;

    //`root` IS THE HOST'S, NOT THE app SERVICE'S. main.js puts it on the host
    //object it hands the bundle; `app.root` reads undefined here and every
    //path.join built from it throws "path must be of type string" from a line
    //that looks like it is about a README. ../../app/demo/server.js takes it
    //the same way.
    var ROOT = app.host.root;

    //---- tools ---------------------------------------------------------------

    //THE SIMPLEST ONE: no arguments, and an outputSchema so the answer arrives
    //as structuredContent as well as text. A client that validates gets to;
    //one that does not still sees json in the transcript.
    mcp.tool('app_status', {
        title: 'App status',
        description: 'Whether the app is up, what it is called, and what it is spending. ' +
            'Numbers are this process, not a fixture.',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                version: { type: 'string' },
                pid: { type: 'number' },
                uptimeSeconds: { type: 'number' },
                memoryMB: { type: 'number' },
                windowOpen: { type: 'boolean' },
                url: { type: ['string', 'null'], description: 'null when this build serves nothing' },
                packaged: { type: 'boolean' }
            },
            required: ['name', 'version', 'pid', 'uptimeSeconds', 'memoryMB', 'windowOpen', 'packaged']
        },
        run: function () {
            return {
                name: appPackage.name,
                version: appPackage.version,
                pid: process.pid,
                uptimeSeconds: Math.round(process.uptime()),
                memoryMB: Math.round(process.memoryUsage().rss / 1048576),
                windowOpen: win.isOpen,
                url: win.url || null,
                packaged: !!app.host.isPackaged
            };
        }
    });

    //A TOOL THAT ANSWERS WITH A PICTURE. `content` is written out in full here
    //rather than left to ../mcp to guess: base64 and a mimeType is what an
    //image block is, and a tool that returned the raw buffer would be sending
    //a megabyte of json nobody can read.
    //
    //It goes through the app's own `capture` command -- the same one the cli
    //and the driver use -- so there is one implementation of "photograph the
    //window", including the part that knows a minimized one has no frame.
    mcp.tool('screenshot', {
        title: 'Screenshot the window',
        description: 'A picture of the app window as it is right now. ' +
            'Says so instead when the window is hidden or minimized.',
        inputSchema: {
            type: 'object',
            properties: {
                format: { type: 'string', enum: ['png', 'jpeg'], description: 'png by default' }
            }
        },
        annotations: { readOnlyHint: true },
        run: async function (args) {
            var shot = await ipc.invoke('capture', {
                format: args.format === 'jpeg' ? 'jpeg' : 'png',
                path: path.join(os.tmpdir(), 'mcp-shot.' + (args.format === 'jpeg' ? 'jpg' : 'png'))
            });

            //THE SKIP IS AN ANSWER, NOT A FAILURE -- see core/window. A tool
            //that threw here would tell a model the app is broken when the
            //window is merely minimized.
            if (shot.skipped) return 'No picture: ' + shot.why;

            return {
                content: [
                    { type: 'text', text: 'The window, ' + shot.width + 'x' + shot.height },
                    {
                        type: 'image',
                        data: fs.readFileSync(shot.path).toString('base64'),
                        mimeType: shot.format === 'jpeg' ? 'image/jpeg' : 'image/png'
                    }
                ]
            };
        }
    });

    //ONE THAT ACTS, and the one worth a confirmation prompt. `click` is the
    //app's own verb, so this inherits what it already knows: it names what it
    //clicked, it refuses a selector that matches nothing rather than silently
    //doing nothing, and it says which view answered.
    mcp.tool('click', {
        title: 'Click something in the window',
        description: 'Click a control by its text or by a css selector -- "Cheatsheet", or "button.btn-primary".',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'the visible text, or a css selector' }
            },
            required: ['target']
        },
        annotations: { destructiveHint: false, openWorldHint: false },
        run: async function (args) {
            //`invoke` REJECTS rather than answering {error}, which is what the
            //cli relies on -- so nothing is checked here and ../mcp turns the
            //throw into a result with isError. A model reading "nothing matches
            //Cheatsheet" can try something else; a protocol error just stops it.
            var answer = await ipc.invoke('click', { selector: args.target });

            //the window answers with what it clicked and which view answered,
            //not with what was asked for -- so a wrong guess is visible
            return 'clicked ' + answer.clicked + ', found by ' + answer.found +
                ' (view ' + answer.view + ')';
        }
    });

    mcp.tool('read_screen', {
        title: 'Read what the window says',
        description: 'The text of everything matching a selector, with the contrast each one measures ' +
            'against what is behind it.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'css selector, e.g. "main h1" or ".app-sidebar .nav-link"' }
            },
            required: ['selector']
        },
        annotations: { readOnlyHint: true },
        run: async function (args) {
            return await ipc.invoke('read', { selector: args.selector });
        }
    });

    //---- resources -----------------------------------------------------------

    //THE GRAPH, WHICH IS THE THING THIS SCAFFOLD IS ABOUT. A resource rather
    //than a tool: it is stable, it has a name worth remembering, and reading it
    //twice is not an event.
    mcp.resource('app://plugins', {
        name: 'plugins',
        title: 'The resolved plugin graph',
        description: 'Every plugin the node half resolved, in load order, with what it provides and consumes.',
        mimeType: 'application/json',
        read: function () {
            return JSON.stringify(app.plugins.map(function (one) {
                return { name: one.name, provides: one.provides, consumes: one.consumes };
            }), null, 2);
        }
    });

    mcp.resource('app://log', {
        name: 'log',
        title: 'The running app log',
        description: 'What the app has been saying, minus chromium noise. The last 200 lines.',
        mimeType: 'text/plain',
        read: function () {
            var file = path.join(ROOT, 'nw.log');
            if (!fs.existsSync(file)) return 'nothing has been written to nw.log yet';

            var lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
            return lines.slice(-200).join('\n');
        }
    });

    //A TEMPLATE IS HOW A CLIENT LEARNS IT MAY ASK FOR SOMETHING NOBODY LISTED.
    //Every plugin carries a README; listing two dozen of them would bury the
    //two above, so the shape is offered instead.
    mcp.template('app://readme/{plugin}', {
        name: 'plugin README',
        title: 'A plugin README',
        description: 'The README of any plugin, by folder -- app://readme/core/io, app://readme/mcp.',
        mimeType: 'text/markdown',

        match: function (uri) { return uri.indexOf('app://readme/') === 0; },

        read: function (uri) {
            var asked = uri.slice('app://readme/'.length);

            //A URI IS UNTRUSTED INPUT. `app://readme/../../../etc/passwd` is
            //the obvious thing to try, and a resource that reads a path built
            //by concatenation is how it works. So: no dots, no absolutes, and
            //the resolved path has to still be inside a plugin root.
            if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(asked) || asked.indexOf('..') >= 0)
                throw new Error('not a plugin folder: ' + asked);

            //BUILD_ROOTS RATHER THAN src/roots.js, because this file is bundled
            //-- roots.js reads package.json, and requiring package.json from
            //the server bundle would ship the whole manifest with it. Same
            //reason core/appPackage/server.js takes its six fields off the host.
            var roots = BUILD_ROOTS.map(function (name) { return path.join(ROOT, 'src', name); });

            var found = roots.map(function (root) { return path.join(root, asked, 'README.md'); })
                .filter(function (file) {
                    return file.indexOf(path.join(ROOT, 'src')) === 0 && fs.existsSync(file);
                })[0];

            if (!found) throw new Error('no README for ' + asked);
            return fs.readFileSync(found, 'utf8');
        }
    });

    //---- prompts -------------------------------------------------------------

    //A PROMPT IS THE USER'S, NOT THE MODEL'S: it turns up as a slash command,
    //with the awkward part already written. This one is the question somebody
    //actually asks about this app.
    mcp.prompt('explain_plugin', {
        title: 'Explain a plugin',
        description: 'Read a plugin README and its place in the graph, and explain what it is for.',
        arguments: [
            { name: 'plugin', description: 'the folder, e.g. core/bridge or ui/xterm', required: true }
        ],
        get: function (args) {
            return [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: 'Explain the `' + args.plugin + '` plugin of this app: what it is for, ' +
                            'what it provides and consumes, and which decision in it took measuring. ' +
                            'The README is attached, and app://plugins has the resolved graph.'
                    }
                },
                {
                    //AN EMBEDDED RESOURCE, so the client does not have to fetch
                    //it separately and the prompt is one thing rather than an
                    //instruction to go and get something.
                    role: 'user',
                    content: {
                        type: 'resource',
                        resource: {
                            uri: 'app://readme/' + args.plugin,
                            mimeType: 'text/markdown',
                            text: readmeFor(args.plugin)
                        }
                    }
                }
            ];
        }
    });

    mcp.prompt('check_the_window', {
        title: 'Check the window',
        description: 'Screenshot the app, read its headings, and say whether anything looks wrong.',
        arguments: [
            { name: 'page', description: 'a page to open first, e.g. Graph', required: false }
        ],
        get: function (args) {
            var open = args.page ? 'Open the ' + args.page + ' page first, then ' : '';

            return [
                open + 'take a screenshot of the window and read `main h1, main h2`. ' +
                'Say whether the page rendered, whether anything is unreadable, and what it is showing. ' +
                'Use the screenshot rather than describing what you expect to see.'
            ];
        }
    });

    function readmeFor(name) {
        try {
            var roots = BUILD_ROOTS.map(function (root) { return path.join(ROOT, 'src', root); });
            var file = roots.map(function (root) { return path.join(root, name, 'README.md'); })
                .filter(fs.existsSync)[0];
            return file ? fs.readFileSync(file, 'utf8') : 'There is no README for ' + name + '.';
        } catch (e) {
            return 'The README could not be read: ' + (e && e.message);
        }
    }

    await register(null, {});
}
module.exports = plugin;
