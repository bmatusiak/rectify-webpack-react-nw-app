# io

Socket.io, all three sides — and in a packaged build, something else wearing its
shape.

| file | provides | consumes |
|---|---|---|
| `main.js` | `io` | `http`, `bridge` |
| `server.js` | `io` | `app`, `Plugin` |
| `window.js` | `io` | — |

Plus three files with no `provides`, required by the halves beside them:

- **`serve.js`** — the server side of the conversation, in one function so both
  halves can run it
- **`fanout.js`** — one `io` over however many transports there are
- **`mock.js`** — a socket.io-shaped pair of endpoints, in memory

## two kinds of client, one set of handlers

The nw window is on [bridge](../bridge/), a direct channel between main and the
page. A browser looking at the same app is on socket.io over http. `serve.js`
should not know that, so `main.js` hands the rest of the app a single `io` and
`fanout.js` spreads what it is told across whatever is actually there.

**The window is on the bridge in every build**, not only when packaged. That is
what makes development behave the way a package does: turn the browser viewer
off and the app is running exactly the code path it will ship with. It used to be
`BUILD_PROD ? bridge : socket.io`, so the transport nobody ships was the one
every day of development exercised.

Socket.io is attached even when nothing may connect, because the tray can switch
the viewer on while the app is running and there would otherwise be nothing to
switch on. A gate refuses connections while [`http.serving`](../http/) is false —
with an error rather than a silent hang, so a browser pointed at an app with the
viewer off is told why — and turning it off drops whoever is already there.
Refusing new connections while leaving old ones live would make the tray item a
lie.

### a handler registered late is told what is already here

The node half is torn down and rebuilt on every save, so `serve.js` registers
again on each reload — and by then the window has long since connected. Over
socket.io that was invisible: the reload drops every client and the client
reconnects, which fires `connection` again. **The bridge has no reconnect,
because its peer never left** — the window simply stopped being mentioned to
anyone, and the new build sat there with no clients at all.

So `fanout.on('connection', …)` hands a new handler every socket that is still
connected. Only what is still connected, so it cannot double-deliver: a
socket.io client dropped by the reload is already out of the map by then and
comes back the ordinary way.

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

## the window waits for the bridge

`window.js` prefers the bridge whenever main has injected a way home, and
**waits about half a second for it** rather than deciding on its first look. Nw
does not re-fire `document-start` on a reload, so after webpack full-reloads the
page main has to put `__host` back on `loaded` — which arrives after this code
has already run. Deciding immediately meant an ordinary save left the window on
an error overlay, having fallen through to a socket.io server that is off.

A browser has no main to wait for and simply spends the half second.

**It waits on a timer, not in animation frames.** That looked like a race with
main rather than with a network, so `requestAnimationFrame` seemed the honest
instrument. It is not one: **chromium does not run animation frames for a window
nobody is looking at.** A browser view opens, goes behind the app window, stops
being animated — and the loop never advanced, so the page never fell through to
socket.io and sat there forever having logged nothing at all. No error, no
overlay, just a viewer that never arrived. A timer is throttled in a background
window and still fires, which is the difference that matters.
