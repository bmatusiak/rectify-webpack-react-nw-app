# mcp-example

Everything an MCP server can offer, registered against a **real** app.

| file | provides | consumes |
|---|---|---|
| `server.js` | — | `mcp`, `ipc`, `app`, `appPackage`, `window` |

| | what | why it is that kind |
|---|---|---|
| tool | `app_status` | no arguments, an `outputSchema`, so the answer arrives as `structuredContent` as well as text |
| tool | `screenshot` | answers with an **image** block — base64 and a mimeType |
| tool | `click` | it **acts**, and it is the one worth a confirmation prompt |
| tool | `read_screen` | a question about a moment, with the contrast of everything it read |
| resource | `app://plugins` | the resolved graph — stable, named, worth reading twice |
| resource | `app://log` | the last 200 lines of what the app has been saying |
| template | `app://readme/{plugin}` | how a client learns it may ask for a uri nobody listed |
| prompt | `explain_plugin` | takes an argument, and **embeds** the README as a resource |
| prompt | `check_the_window` | an optional argument, and an instruction to look rather than assume |

It provides nothing and consumes five services, which is what a plugin that
exists to *add to others* looks like — see [demo](../../app/demo/) and
[remote](../../app/remote/).

## a tool, a resource, or a prompt

The three are not interchangeable, and choosing wrongly is the common mistake:

- a **tool** is something the model may decide to *do*. It acts, it can fail,
  and a human should be able to watch it happen.
- a **resource** is something to read *into context*. It has a uri, it is stable
  enough to be worth naming, and asking for it twice is not an event.
- a **prompt** is something the *user* picks — a slash command with the awkward
  part already written. Not something a model chooses.

`app://plugins` could have been a `list_plugins` tool and it would work. It is a
resource because nothing *happens* when you read it, and a client can put it in
front of the model without asking anyone's permission.

## nothing here is a mock

The same choice [demo](../../app/demo/) makes, for the same reason. `screenshot`
photographs the window that is on screen; `app://log` is the real log;
`app_status` is this process's own memory and uptime. A fixture would
demonstrate the shapes and prove nothing about the app — and when a service
breaks, these break with it rather than continuing to look correct.

`click` and `read_screen` go through the app's own `click` and `read` commands —
the ones [remote](../../app/remote/) answers and `npm run cli` and
`npm run drive` already use. One implementation of "click the thing that says
Cheatsheet", not two.

## a uri is untrusted input

`app://readme/{plugin}` reads a file whose path comes from the client, so
`app://readme/../../../../etc/passwd` is the first thing to try. The name is
matched against `[a-z0-9][a-z0-9/_-]*`, `..` is refused outright, and the
resolved path still has to be inside `src/` — three checks, because a resource
that reads a path built by concatenation is exactly how that works.

## the screenshot says when there is nothing to photograph

A hidden or minimized window has no frame, and
[window](../../app/core/window/) answers that with `{ skipped, why }` rather
than an error. The tool passes that through as ordinary text: throwing would
tell the model the app is broken when the window is merely minimized, and a
model that believes that stops trying.
