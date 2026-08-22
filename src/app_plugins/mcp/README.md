# mcp

An **MCP server** for this app: the tools, resources and prompts a plugin
registers, answered over the control socket the app already listens on.

| file | provides | consumes |
|---|---|---|
| `server.js` | `mcp` | `ipc`, `appPackage`, `Plugin` |

```
mcp.tool(name, { title, description, inputSchema, outputSchema, annotations, run })
mcp.resource(uri, { name, title, description, mimeType, read })
mcp.template(uriTemplate, { name, description, mimeType, match, read })
mcp.prompt(name, { title, description, arguments, get })
mcp.offering    what is registered right now
```

[`tools/mcp.js`](../../../tools/mcp.js) is the transport — it turns this into
JSON-RPC on stdin and stdout. [mcp-example](../mcp-example/) is a plugin that
registers one of everything.

```
claude mcp add rectify-nw -- node /path/to/tools/mcp.js
```

## the protocol is not in here

This half holds three registries and answers four ipc commands with them:
`mcp:describe`, `mcp:call`, `mcp:read`, `mcp:prompt`. The shapes it answers with
are the protocol's, so the bridge is an envelope and a socket rather than a
second implementation of everything here.

That cut is the point. **A plugin offering a tool should not have to know what a
JSON-RPC envelope looks like**, and a transport should not have to know what
this app can do — which is what makes a second transport (MCP over the http
server, for a client that cannot launch a process) a file that talks to these
same four commands.

## opt in, not reflect

The obvious other way is to expose `ipc.commands()`. The app already lists
fourteen, with help text and argument names, and a dozen lines here would turn
that into a tool list for nothing.

It would also hand a model **`quit`**, `hide` and `serve`, because they are in
the same list. And MCP wants a description and a JSON schema, which
`help: 'is the app up, and where'` and `args: ['path']` are not — a schema is
how a model knows `format` takes `png` or `jpeg` rather than guessing.

So a tool is something a plugin says out loud, in a sentence written for a
reader who is not a person.

## it adds no surface, and the http one would

Everything here is answered over [ipc](../../app/core/ipc/) — the same control
socket `node src/cli.js` uses, with the same token. **Anything that can reach
this can already run `node src/cli.js quit`.** Adding MCP over the socket adds a
vocabulary, not an entrance.

That is not true of the http transport, which is why it is not built into this
plugin: it would be gated by [http](../../app/core/http/)'s `serving` switch,
off unless asked for, and gone entirely from a build made with
`"canServe": false`.

**It is not a security boundary.** It is a described, schema'd, deliberately
small subset of the app aimed at a model instead of at a person.

## three details that are not arbitrary

**A tool that throws is not a protocol error.** MCP separates the two, and the
difference is only knowable here: an unknown tool is the client's mistake and
gets a JSON-RPC error, while a tool that ran and failed is a *result* with
`isError: true` — because the model is meant to read what went wrong and try
something else. `click` with a selector that matches nothing is the second kind.

**A registered name is a key, not a label.** Registering the same name twice
replaces it. This half is rebuilt on every save, so a plugin that registers on
load would otherwise offer three copies of one tool by lunchtime — the same
reason [banner](../../app/ui/banner/) replaces by id.

**Capabilities are declared from what is actually registered.** Announcing
`prompts` when nothing registered one makes a client show an empty menu and the
user wonder what they did wrong.

## an object answer goes out twice

A tool may answer with a string, a plain object, or the protocol's own `content`
shape. The first two are what nearly every tool wants and are not made to spell
it out; the third is what a tool returning an image needs.

An object goes out as `structuredContent` **and** as the same json in a text
block, which is what the spec asks for: a client that validates against
`outputSchema` gets to, and one that does not still shows something readable in
a transcript. `structuredContent` is only sent when the tool declared an
`outputSchema`, since without one there is nothing to validate it against.

## the tests

`server.test.js`, run inside the app, and
[`test/mcp.test.js`](../../../test/mcp.test.js), which speaks the actual
protocol to the bridge over a pipe — `initialize`, every list, a call, a read, a
prompt, and the four ways of being wrong. The second is the one that would catch
a change to these shapes, because it reads them the way a client does.
