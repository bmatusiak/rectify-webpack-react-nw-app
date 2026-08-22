# mcp

An **MCP server** for this app: the tools, resources and prompts a plugin
registers, answered over the control socket the app already listens on.

| file | provides | consumes |
|---|---|---|
| `server.js` | `mcp` | `ipc`, `appPackage`, `app`, `Plugin` |

```
mcp.tool(name, { title, description, inputSchema, outputSchema, annotations, run })
mcp.resource(uri, { name, title, description, mimeType, read })
mcp.template(uriTemplate, { name, description, mimeType, match, read })
mcp.prompt(name, { title, description, arguments, get })
mcp.offering    what is registered right now
```

Two transports, and `./rpc.js` is the protocol they share:
[`tools/mcp.js`](../../../tools/mcp.js) speaks it on stdin and stdout to a
client that launched it, and `./http.js` speaks it over the app's own http
server to one that cannot. [mcp-example](../mcp-example/) is a plugin that
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
this app can do — which is what made the second transport a file that talks to
these same four commands, and `./rpc.js` a thing both of them borrow.

`./rpc.js` is shared for a measured reason: the version with the dispatch
written out twice lasted about an hour before the two disagreed about what
`resources/read` does with a uri nobody registered.

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

That is not true of `./http.js`, which is why it is behind three gates rather
than one — see below. It is off unless somebody asked for a browser viewer, and
gone entirely from a build made with `"canServe": false`.

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

## the second transport, and every gate it is behind

`./http.js` answers MCP at **`POST /mcp`** on the app's own server, for a client
that cannot launch a process. Prefer the stdio bridge, which opens nothing.

This one is a listening surface, so it sits behind three gates:

| | |
|---|---|
| `BUILD_SERVABLE` | a build made with `"canServe": false` has no routes at all, and **the require is gated, not just the call** — the same measured rule [io](../../app/core/io/) follows, or webpack ships `http.js` and express's json parser into a binary whose README says they are gone |
| `http.serving` | off unless somebody asked for a browser viewer — the switch the tray flips |
| `Origin` | refused unless it is absent or local |

**The Origin check is not decoration.** A page on the open internet cannot read
this port's replies, but it can send to it — and "cannot read the reply" is no
comfort when the request was `tools/call click`. That is DNS rebinding, it is
the named risk in the transport spec, and an unexpected Origin is the only
signal separating it from the client that is meant to be here.

**It is stateless, and says so.** The spec's streamable transport can hold a
session and push messages over SSE; nothing here has anything to push, so a POST
is a question and its answer, `Mcp-Session-Id` is not issued, and a GET answers
**405 with `Allow: POST`** rather than falling through to the app's 404 — which
would tell a client the endpoint does not exist when only the stream does not.

A notification gets **202 and no body**. A batch is answered as a batch.

**`http` is not a service in this context.** It is provided by
[core/http](../../app/core/http/) on nw's node side; this half is the bundle,
and what it gets is `app.host` — the swappable router to mount on and a
forwarded view of `serving`. Consuming `'http'` here fails the graph outright.

## the tests

Two, and they sit on opposite sides of the door. [`server.test.js`](server.test.js)
runs INSIDE the app, against the real registries. [`node.test.js`](node.test.js)
runs outside it, in the test runner's own process, and speaks the actual protocol
to the bridge over a pipe — `initialize`, every list, a call, a read, a prompt,
and the four ways of being wrong. The second is the one that would catch a change
to these shapes, because it reads them the way a client does.

It is `node.test.js` rather than a context because it cannot be a plugin: the
point of it is to be a stranger at the door. It lived in `test/` until that was
noticed to break `npm test -- mcp`, which matched the file and stopped looking
for the plugin.
