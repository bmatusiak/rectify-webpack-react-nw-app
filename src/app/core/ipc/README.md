# ipc

The app's control socket. `src/cli.js` talks to it; any plugin can answer on it.

| file | provides | consumes |
|---|---|---|
| `main.js` | `ipc` | `app`, `Plugin` |
| `server.js` | `ipc` | `app` |
| `cli.js` | `ipc` | `app` |

Plus **`endpoint.js`** — where it lives, and where the token sits. No
`provides`; required by all three.

```
ipc.handle(name, fn)   answer a command. returns { remove() }
ipc.commands()         what this build understands
ipc.invoke(name, data) call a handler without going through a socket   (main)
ipc.call(name, data)   ask the running app                             (cli)
ipc.address
```

## a named pipe, not a port

Windows gets a named pipe, which lives in the pipe namespace rather than on
disk; everywhere else a unix domain socket, a real file in the temp directory.
Both sides derive the address from the package name, so nothing has to be
discovered or written down — and the cli needs no dependency beyond `net`.

The windows form is built from char codes rather than written out. A literal is
four backslashes deep, and every layer between the source and the file has an
opinion about those.

## it is not open to whoever finds it

A named pipe on windows is reachable by **anyone logged into the machine** — the
default acl is not restrictive — and `/tmp` on posix is world-readable. Being
hard to find is not the same as being hard to reach.

So the app writes a fresh **32-byte token** beside the socket every run, in the
per-user temp directory and `0600` on posix, and refuses any command from a
client that cannot repeat it:

```
{"id":1,"command":"auth","data":{"token":"…"}}
{"id":1,"ok":true,"result":"ok"}
```

Details that are load-bearing:

- `writeFileSync` applies its `mode` **only when it creates the file**, so a
  leftover from a previous run would keep whatever permissions it had. It is
  `chmod`ed after writing.
- The comparison is `timingSafeEqual` **behind a length check**, which it needs
  because that function throws on a length mismatch rather than returning false.
- A client that connects and then says nothing holds a handle open forever, so
  it is dropped after five seconds.
- The token file goes away on teardown. No file means either nothing is running
  or it is running as somebody else — both better said than guessed at.

## one json object per line

```
{"id":1,"command":"open","data":{}}
{"id":1,"ok":true,"result":"shown"}
```

Unknown command, bad json and a throwing handler all come back as
`{ok: false, error}` rather than closing the connection.

## why the listener is in main

For the same reason the window and the tray are: **a reload would drop every
connected client and then race to re-listen on an address still held.**

`server.js` therefore does not listen. It forwards to the listener in `main.js`
and hands every registration back on teardown, so a save does not leave the
previous build's answers still wired up:

```js
//src/app/my-thing/server.js
var answered = ipc.handle('my-thing', async function (data) { return { ok: true }; });

await register(null, { onDestroy: function () { answered.remove(); } });
```

That is all a plugin needs to be reachable from the terminal — the cli forwards
anything its own table does not know, so no `cli.js` is required. See
[cli](../cli/).

**`invoke` is the door for this process.** The window and the cli reach a
handler over the wire; something running in `main.js` has no wire, and opening a
connection to ourselves to ask ourselves a question would be a strange way to do
it.

## two failures it absorbs

- **A stale socket file.** A hard kill leaves it behind on posix, and listening
  again then fails `EADDRINUSE` with nothing actually holding it, so a stale one
  is unlinked before binding.
- **Not listening at all.** A bind error is logged and startup continues. An app
  without a control socket is still an app.
