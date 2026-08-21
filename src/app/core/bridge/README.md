# bridge

What replaces socket.io when there is no server.

| file | provides | consumes |
|---|---|---|
| `main.js` | `bridge` | `app` |

Plus two files with no `provides`:

- **`wire.js`** — the message protocol, in one file so both ends run the same
  code rather than two implementations of one idea
- **`page.js`** — the page end. Named `page.js` and not `window.js` because that
  filename means *the window half of a plugin*, and the loader tried to boot it
  as one the moment it was called that.

## why

A packaged build **opens no port at all** — no http, no socket.io, no webpack.
The window is opened straight out of the package, so there is nothing to connect
to and nothing that could serve it.

What there is instead is a message channel:

```
main  →  page    postMessage
page  →  main    a function injected before any of the page's own script runs
```

And what it hands the rest of the app is **shaped like socket.io**, because every
plugin's server half is already written against that and none of them should
have to know which build they are in. It is a small shim over `wire.js`, not an
implementation of socket.io: what is here is what this app actually calls.

```
bridge.io          the socket.io-Server-shaped end. io/main.js registers it as `io`
bridge.attach(win) wire up a window
bridge.page        'view.html' — the visible page, which has no script in it
bridge.connected
```

## the protocol

Deliberately the shape the [control socket](../ipc/) already uses — one json
object per line, a reply carrying the id of what it answers. That is also what
socket.io does underneath its api, which is why the shim on top can be small
enough to trust.

```
{"event":"ping","data":{},"id":3}     a call that wants an answer
{"reply":3,"data":{"pong":true}}      the answer
{"event":"app","data":{...}}          a message that does not
```

## the two moments

**`document-start`** — `frame.__host` is planted before any of the page's own
script runs, so the page can never find itself without a way home. `page.js`
looking for it is how the window knows which build it is in.

**`document-end`** — now there is a document to render into, so the window half
is `eval`'d in. It was built before packaging and rides along inside `main.bin`
**as a string**, which is what keeps javascript off disk when there is no server
to serve it from.

**Anything said before the page can hear is queued, not dropped.** Chromium
refuses a `postMessage` to a window it has not finished setting up — quietly,
with a console warning — and the message lost there would be the handshake
itself.

## what it is not

It is not a security boundary; it is the absence of one. There is no port, so
nothing on the machine can reach the app by opening a socket to it — that is the
whole claim. The window half is still delivered to a browser context to run, and
is readable there by anyone who opens devtools, as any client code is.
