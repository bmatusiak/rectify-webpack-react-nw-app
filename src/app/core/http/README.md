# http

One express app, one server — and in a packaged build, nothing at all.

| file | provides | consumes |
|---|---|---|
| `main.js` | `http` | `app` |

```
http.url          the address, or null when nothing is listening
http.router       the current router. mount here, not on the app
http.swapRouter() a fresh one, dropping every route from the last load
http.listen()     bind, and resolve the url
http.express      http.app      http.server
```

**Mount on the router, not on the app.** Plugins add routes to a router that
express reaches through one indirection, so the whole set can be thrown away and
rebuilt when the server half reloads. Mounting on the app itself stacks a second
copy of every route on every save.

**Port 0 by default** — whatever is free, so two copies can run side by side and
nothing depends on a fixed number. `PORT` pins it, `HOST` moves it off
localhost. A pinned port that is taken says so by name rather than throwing
`EADDRINUSE` at you.

## in a package

A packaged build **serves nothing to nobody**: no listener, no express, and
nothing on the machine that can reach the app by opening a socket to it. The
window is opened out of the package instead — see [bridge](../bridge/).

The service still exists, because the graph is the same in both builds. What it
does is nothing:

- `router` and `app` are stubs whose every verb returns the stub. A plugin is
  free to mount a route without asking which build it is in; there is nowhere
  for that route to be reached from, so it goes nowhere rather than throwing. An
  app that will not start because one plugin offered an endpoint nobody can call
  is the worse failure.
- **`url` is `null`, and that is the honest signal.** It is what the tray and
  the window check before offering to open anything.
