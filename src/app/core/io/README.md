# io

Socket.io, all three sides — and in a packaged build, something else wearing its
shape.

| file | provides | consumes |
|---|---|---|
| `main.js` | `io` | `http`, `bridge` |
| `server.js` | `io` | `app`, `Plugin` |
| `window.js` | `io` | — |

Plus two files with no `provides`, required by the halves beside them:

- **`serve.js`** — the server side of the conversation, in one function so both
  halves can run it
- **`mock.js`** — a socket.io-shaped pair of endpoints, in memory

## the three sides

`main.js` **creates** the server and owns it, because it has to outlive the
bundle. `server.js` **registers the handlers**, and reloads. `window.js`
**connects**.

That split is the point: the handlers are the part that changes while you work,
and the listener is the part that must not be dropped and rebound underneath
live clients.

## the handlers come off again

`server.js` is reloaded on every save, so it gives its listeners back in
teardown — otherwise each reload leaves another copy listening and one `ping`
answers three times.

## reconnecting is the client's job

The node half reloads by dropping everyone, and whether they come back depends
on **how** they were dropped:

> socket.io-client retries a connection that closed under it (`transport close`,
> `ping timeout`). A disconnect the **server asked for** — reason
> `io server disconnect` — it treats as final, because that is read as the
> server meaning it.

So the page reconnects itself:

```js
socket.on('disconnect', function (reason) {
    if (reason == 'io server disconnect') socket.connect();
});
```

`io.disconnectSockets(true)` looks like the fix from the server side. It is not
— measured, the client reports `io server disconnect` either way.

The disconnect reason is logged out loud, and that line earns its place: **a page
whose socket is dead looks exactly like a working one** — still on screen, still
rendered — until you click something.

## the handshake rides the connection

`serve.js` emits `app` on connect, because the window has no node to read a
`package.json` with. That payload is kept **on the socket** and handed out as a
service by [appPackage](../appPackage/), so wanting the app's title does not
mean consuming a transport.

A connection that never answers fails with the address it tried and a suggestion,
rather than hanging.

## ?mock

`?mock` runs `serve.js` **in the page**, against `mock.js` instead of a wire:
the real server code, not a second implementation of it. Both halves of every
plugin are in the client bundle anyway, so this costs nothing to have.

It is **opt-in on purpose.** Falling back to it on a failed connection silently
served made-up data whenever the server was merely slow.

## in a package

There is no http server for socket.io to live on. What there is instead is a
message channel to the window wearing the same api — see [bridge](../bridge/).
`main.js` picks it from `BUILD_PROD`; `window.js` picks it by finding what main
injected. **Nothing downstream can tell the difference.**
