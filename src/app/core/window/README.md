# window

The nw.js window. It is a view onto a server that outlives it.

| file | provides | consumes |
|---|---|---|
| `main.js` | `window` | `app`, `http`, `lifecycle`, `bridge` |

```sh
node src/cli.js capture    # a picture of the window
```

## writing either of them down is somebody else's plugin

`window.markup()` reads the page, `window.styles()` reads what it is made to look
like, and both are scrubbed; `window.capture()` photographs
it. Those are things a window can do. **Putting either on disk is a feature, and
it lives in [`debug-snapshot`](../../debug-snapshot/)** — the commands, the guard
in front of them, the key that takes both at once and the notice offering the
paths, in one folder that can be deleted whole. This plugin cannot be deleted;
it is the window.

## markup is scrubbed here, and the scrub is not a guarantee

The [`durable`](../log/looks-like.js) rules run over it on the way out — the same
ones [`events`](../events/) uses for a record kept for ever, and for the same
reason: this ends up attached to bug reports.

**Redaction catches what has a shape.** A github token goes; a long random run
goes; the tail of a URL goes. **A short, plain secret on the page does not.**

That is not hypothetical here. [`demo/pages/plumbing.js`](../../demo/pages/) draws
an *opened* secret in a badge — visible text, not an attribute — and
`a-token-worth-keeping` survives the scrub because nothing about it looks like a
credential. Measured, on a real capture.

The app this came from does not scrub at all, and its own header is honest about
why that has been survivable: React sets `value` as a **property** while
`outerHTML` serialises **attributes**, so a typed-in value never reaches the
file. That is a property of React rather than a rule anybody enforces, it stops
being true for an uncontrolled input, and it says nothing whatever about text
that is simply *on* the page.

**So look at the file before sharing it.**
[`debug-snapshot`](../../debug-snapshot/)'s cli says so on every run rather than
leaving it here.
| `server.js` | `window` | `app`, `ipc`, `Plugin` |
| `cli.js` | — | `cli`, `ipc` |

```
window.url  .isOpen  .isMinimized  .current
window.open()  .show()  .hide()  .openInBrowser()  .quit(reason)
window.capture({ format })   -> a picture, or { skipped, why }
window.markup()    -> the page, scrubbed        .styles() -> its css, scrubbed
window.views       .openView()  .closeView(session)
```

The plugin that spans all four runtimes, and `capture` is why: `capturePage`
exists only where the window handle does, so **main** takes the picture,
**server** answers on the socket and writes the file, and **cli** exists only to
resolve the path — the app's working directory is wherever it was launched from
and yours is not.

## closing is not quitting

Closing the window hides it; the node half keeps running behind the tray icon.
Reopen from the tray, or by running `npm start` again.

**Its listeners are removed by name, not with `removeAllListeners`.** That was
harmless while this plugin was the only thing listening to the window, and
stopped being harmless the moment [bridge](../bridge/) started attaching in
development too: the first page reload took the bridge's own `closed` handler
with it. A window several plugins share is not this one's to clear.

**Two mechanisms hold that up, because one of them is not reliable:**

1. `close` is intercepted and the window hidden instead, so reopening is instant
   with the page state intact. Nice when it works — but **a page reload silently
   drops that listener** while leaving `loaded` firing, and the window half
   full-reloads on any change it cannot hot swap. So the first edit you make
   turns close back into a real close. Re-attaching on `loaded` does not fix it;
   the handle is stale.
2. So a **hidden, never-closed keep-alive window** is opened as well. Nw quits
   when the *last* window closes, and that one never does. If the interception
   held, the window hides; if it did not, the window is destroyed and the app
   survives anyway, and **Open window** makes a fresh one.

Measured both ways: fresh start, close hides it. After an edit, close destroys
it and the app is still serving.

`closeShouldHide(false)` is the fallback — the tray switches it on once it has
an icon, because without one there would be no way back to a hidden window.

## which page it opens

| build | page | why |
|---|---|---|
| development | `http.url` | a remote page, so it has no node |
| packaged | `bridge.page` (`view.html`) | there is no url; see [bridge](../bridge/) |

**The marker is gone, and the bridge replaced it.** This used to append
`?view=app` so the page could tell it was the app's own window rather than a
browser looking at the same url — nw 0.114 sends an ordinary chrome user agent,
so the side that opened it had to say so. Main now injects `__host` into this
window in **every** build, and a browser cannot produce that: the bridge is the
proof, and a better one than a query string anybody could type.

`bridge.attach(w)` therefore runs in both builds. In a package it carries the
window half in with it; in development the page still fetches its own bundle over
http so webpack can hot reload it, and the bridge carries only the app's own
traffic.

## a browser view

```
npm run cli -- browser open     opened browser-1
npm run cli -- browser close
```

**A second window on the same url is already a browser.** It is a remote page
with no `node-remote`, so it has no node, and [bridge](../bridge/) is only ever
attached to the app's own window — so socket.io is its only way home. That is
precisely the path a real browser takes.

It exists because until now nothing exercised that path. The only way to get a
second viewer was `nw.Shell.openExternal`, which hands the url to whatever
browser the machine happens to have and can neither be closed again nor asked
anything. `remote/server.test.js` opens one and drives it.

Each is **stamped with a session** — `?session=browser-1` — because otherwise
views are only tellable apart by socket.io's own id, which is opaque and changes
on every reconnect. The page echoes it back; it cannot use it to claim anything,
since which view is the app window is settled by the transport.

Opening one refuses if the browser viewer is off, because it would have nothing
to connect to. Turning the viewer off drops any that are open, and this plugin
closes its own on teardown.

## capture

```
npm run cli -- capture                            capture-20260820-142201.png
npm run cli -- capture shot.png jpeg              where you say, and lossier
```

Three things had to be measured:

- **Chromium stops drawing a window nothing can see.** So the window is lifted
  to the top of the stack first and put back after. Z-order, **not focus** —
  windows will not let a background process take the foreground, and whatever
  you are typing into keeps it.
- **Pin off, then on.** A capture killed mid-flight leaves the flag set, and
  setting it again on a window that already has it moves nothing — so the window
  stays behind whatever is covering it and the next photograph is of nothing.
  Nw cannot be asked whether it was already pinned, so the undo restores what
  the config asked for rather than what was found.
- **A window raised a moment ago has not been drawn yet**, and `capturePage`
  does not wait — it hands back whatever the compositor last had, which is the
  previous window's contents or nothing at all. Hence the 250ms.

**A hidden or minimized window has no frame.** The callback is never called at
all — not an error, just silence. Every path that hides or shows goes through
this plugin, and nw announces `minimize` and `restore`, so both are known here
and both are answered at once rather than costing fifteen seconds to be told.

**And neither is a failure.** They are facts about where the window is, not
faults in the app, so `capture` resolves `{ skipped: true, why }` instead of
rejecting: nothing is written, the cli says *nothing was captured* and why, and
`npm run drive --shots` counts a skip. It used to fail the page it could not
photograph, which reads as a broken page rather than as a window that is not on
screen — a red run for something that was never wrong.

The 15s timeout is still there, and is now only for what nothing announced: a
window on another desktop, or a compositor that stopped drawing this one.

The buffer stops at the file. It never goes down the socket — the wire is one
json line, and a megabyte of base64 on it would serve nobody when the thing
wants to be a file anyway. What comes back is the path, the byte count and the
dimensions, read out of the image's **own header** rather than from the window:
a screen at 2x returns a picture twice the size the window was asked to be.
