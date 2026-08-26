# bridge

How the nw window and main talk to each other, in **every** build.

| file | provides | consumes |
|---|---|---|
| `main.js` | `bridge` | `app` |

```
bridge.attached   nw handed main a window
bridge.connected  the page has a socket on it
bridge.trouble    what the page is saying went wrong, or null
```

**`attached` and `connected` are different questions**, and telling them apart is
most of a diagnosis: a window whose plugins all threw is attached and not
connected.

**`trouble` is one line of DOM reading in a transport plugin, and it is here
because this is the only half that can answer it.**
[`overlay.js`](../../../overlay.js) draws a red box when something fails
underneath the ui, and both ways it is raised take out whatever would otherwise
read it — a failed server reload takes `remote/server.js`, a window plugin
throwing takes `remote/window.js`. This works in both, because `current.win` is
nw's own handle and needs nothing inside the page to be alive.

Plus two files with no `provides`:

- **`wire.js`** — the message protocol, in one file so both ends run the same
  code rather than two implementations of one idea
- **`page.js`** — the page end. Named `page.js` and not `window.js` because that
  filename means *the window half of a plugin*, and the loader tried to boot it
  as one the moment it was called that.

```
bridge.io          the socket.io-Server-shaped end. io/main.js fans out over it
bridge.attach(win) wire up a window
bridge.detach()    take it off again -- and attach() calls this first
bridge.page        'view.html' — the visible page in a package
bridge.connected
bridge.source      the window half, for whoever else has to hand it out
```

`detach` is exported, and nothing outside this plugin calls it: it is on the
surface because `onDestroy` is it, and because a reader who finds `attach`
without it will reasonably assume attaching twice is safe. It is not. `attach`
calls `detach` first for the reason under *four things about timing* below —
leaving the old listeners on the window sent everything main said to a document
that had already gone, quietly.

`source` exists because a **browser** viewer in a packaged build has no other way
to the window half — the point of the package is that there is no javascript on
disk. [build](../build/) serves it from here rather than reading
`dist/assets.json` a second time.

## why the window is on it even in development

It used to be the packaged-only transport: development served the window over
http and used socket.io, and the bridge was exercised for the first time when
somebody built a package. **The transport every shipped app depends on was the
one no day of development ever ran.**

Now the window is on the bridge always. In development the page is still
*fetched* over http — that is how webpack hot reloads it — but the app's own
traffic never touches a port. Turn the browser viewer off and you are running
the code path a package will ship with. See [http](../http/) for the two
separate facts that makes possible.

## both directions are direct calls

```
main → page    page.post(line)          a function the page handed over
page → main    window.__host.post(line) a function main planted
```

Nw gives main the page's **actual `Window` object** — `frame === win.window`,
measured — so there is no need for the message bus in either direction.

It used to `postMessage` one way, which cost two things. **Chromium can refuse a
postMessage and does it with a console warning rather than a throw**, so
messages went missing silently. And a `message` listener takes events from
anything that can reach the window, with no word about who sent them — a door
that did not need to exist. There is no listener now, so there is nothing to
impersonate.

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

## four things about timing, each of which broke it

**Only the top document.** `document-start` and `document-end` fire for *every*
frame in the window, iframes included, and in nw 0.114 the object handed over is
that frame's `Window` either way — so nothing about the object says which one it
is. The demo's Markdown page renders into a `srcdoc` iframe; that iframe fired
`document-end`, main repointed at it, and everything main said afterwards went
to the iframe and was refused with `Cross-Origin-Opener-Policy policy would
block the window.postMessage call`. Visiting one page broke the whole window,
and it still looked perfectly fine on screen.

A frame answers this about itself: a top-level document is its own `parent`. The
first version compared against `win.window`, which is right until the page
reloads — during `document-start` for the *new* document `win.window` still
refers to the old one, so the guard rejected the very page it exists to protect.

**Both questions are asked now, cheapest first.** `frame === win.window` can only
ever be a *true* positive — a stale one is a different object, so it says false
rather than lying — and asking it first keeps chromium quiet: reading
`frame.parent` in a packaged build is met with *"Cross-Origin-Opener-Policy
policy would block the window.parent call"* on every page load, warned into a log
somebody is trying to read. With only the parent check, a packaged window was
classified as not-top, skipped injection at `document-start`, and worked solely
because `loaded` puts the way home back afterwards. Working by luck is not the
same as working.

**`document-start` does not fire again on a reload.** Measured. Webpack
full-reloads the page whenever it cannot hot swap a module, and `__host` was
injected on the first load and never afterwards: the page came back, could not
find the bridge, fell through to socket.io and was refused by a viewer that is
off. So main puts the way home back on `loaded` too — which arrives *after* the
page's own scripts have run, which is why [io](../io/)'s window half waits a
moment for the bridge rather than deciding on its first look.

**A reloaded page is a new client.** The old socket was still in the map, so
`open()` took its early return, `connection` never fired again, `serve.js` never
sent the handshake — and the page sat on a **white screen with no error
anywhere**, waiting for a message main had decided it did not need to send.
Closing first is what a socket does when the far end goes away, which is exactly
what a reload is.

**Delivery is a microtask, not a synchronous call.** A direct call is
synchronous and postMessage was not, and that difference was load-bearing: the
page says hello from inside `page.js`, and only *after* that does `io/window.js`
register the listener waiting for the handshake. Main answers `hello` by firing
`connection`, which makes `serve.js` emit `app` immediately — so a synchronous
delivery arrived before anything was listening and the wire dropped it for want
of a handler. It is also what a socket does: nothing that talks over one expects
a message to arrive in the same tick it was sent.

Anything said before the page can hear is **queued, not dropped**. Main is ready
before the page is, and the message lost in that gap would be the handshake.

## in a package

The window is opened straight out of the package as `view.html`, and the window
half rides along inside `main.bin` **as a string**, evaluated in at
`document-end` — which is what keeps javascript off disk when there is no server
to serve it from. A packaged build with the viewer off opens **no port at all**.

## what it is not

It is not a security boundary. The window half is still delivered to a browser
context to run and is readable there by anyone who opens devtools, as any client
code is. What the direct calls buy is that nothing else can reach the channel,
and that a refused message is not a possibility.
