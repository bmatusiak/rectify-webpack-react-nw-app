# window

The nw.js window. It is a view onto a server that outlives it.

| file | provides | consumes |
|---|---|---|
| `main.js` | `window` | `app`, `http`, `lifecycle`, `bridge` |
| `server.js` | `window` | `app`, `ipc`, `Plugin` |
| `cli.js` | — | `cli`, `ipc` |

```
window.url  .isOpen  .current
window.open()  .show()  .hide()  .openInBrowser()  .quit(reason)
window.capture({ format })
```

The plugin that spans all four runtimes, and `capture` is why: `capturePage`
exists only where the window handle does, so **main** takes the picture,
**server** answers on the socket and writes the file, and **cli** exists only to
resolve the path — the app's working directory is wherever it was launched from
and yours is not.

## closing is not quitting

Closing the window hides it; the node half keeps running behind the tray icon.
Reopen from the tray, or by running `npm start` again.

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
| development | `http.url + '?view=app'` | a remote page, so it has no node |
| packaged | `bridge.page` (`view.html`) | there is no url; see [bridge](../bridge/) |

`?view=app` marks it as the app's own window rather than a browser looking at
the same address. Nothing in the page can tell on its own — nw 0.114 sends an
**ordinary chrome user agent** with no mention of nw in it — so the side that
opened it is the side that says so. [remote](../../remote/) reads it back. A
packaged window needs no mark: there is nowhere for a second view to come from.

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

**A hidden window has no frame.** The callback is never called at all — not an
error, just silence. Every path that hides or shows goes through this plugin, so
it knows, and says so instead of costing you fifteen seconds to be told the
same. A minimized window looks identical from here and is not tracked; that one
falls to the timeout.

The buffer stops at the file. It never goes down the socket — the wire is one
json line, and a megabyte of base64 on it would serve nobody when the thing
wants to be a file anyway. What comes back is the path, the byte count and the
dimensions, read out of the image's **own header** rather than from the window:
a screen at 2x returns a picture twice the size the window was asked to be.
