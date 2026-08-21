# devtools

Devtools for either half, on the tray. Neither opens by itself.

| file | provides | consumes |
|---|---|---|
| `main.js` | — | `app`, `window`, `tray` |

Provides nothing. It exists only to add two items to somebody else's menu, which
is a perfectly ordinary shape for a plugin here.

**Inspect window** is the easy one: a normal nw window can be told to show its
own devtools. If the window is closed it is opened first — ask again once it is
up.

**Inspect main.js** is not the ordinary thing. `main.js` runs in
`_generated_background_page.html`, which nw does not treat as a window:
`nw.Window.get()` throws `No current window` there, with or without a window
object passed to it. So the way in is chromium's own debugger —

1. `tools/nw.js` starts nw with `--remote-debugging-port=0`
2. chromium picks a free port and writes it to `DevToolsActivePort`
3. `/json` on that port lists a frontend url per target
4. the node context is the one with `type: 'background_page'`

`nw.App.dataPath` is `<user data>/Default` and the port file is one level up in
`<user data>` — both are checked, because the layout differs by platform. The
port is loopback-only and never pinned; pass your own `--remote-debugging-port`
to override it.

Closing a devtools window does nothing to the app.

## not in a package

A packaged build offers **no way in**, and both items are absent. The point of
compiling the node half into `main.bin` is that the code it runs is the code it
shipped with, and a menu item that opens a console onto it hands that straight
back. [tray](../tray/) drops **Open in browser** in the same build, for the
plainer reason that there is no page to open.
