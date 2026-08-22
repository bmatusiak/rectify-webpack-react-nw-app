# http

One express app, one server, and **two separate facts about it**.

| file | provides | consumes |
|---|---|---|
| `main.js` | `http` | `app` |

```
http.listening    is there a port at all
http.url          .host  .port        null until it is listening
http.serving      may a browser be a CLIENT
http.setServing(on)                   turn it on or off while running
http.onServing(fn)                    so the tray can redraw
http.router       .swapRouter()       mount here, not on the app
http.express      .app  .server
```

## listening is not serving

**Listening** is whether there is a port. In development there always is,
because webpack serves the window half over it and hot reloads it; in a packaged
build there is one only if somebody asked.

**Serving** is whether a browser may be a *client* — whether socket.io will take
a connection and the tray offers to open one. It can be off while the server is
still listening, which is exactly the development case: webpack keeps its port
and the app otherwise behaves the way a package does.

**The nw window is on neither.** It talks to main over [bridge](../bridge/) in
every build, so none of this decides whether the app works — only whether a
second viewer can join.

That asymmetry is why turning the viewer off does not always stop listening. A
packaged build has nothing else using the port, so off means off and the app goes
back to having none.

## where it listens

[`src/serve.js`](../../../serve.js) answers `false` or `{host, port}`, from
`package.json`'s `"app": { "serve": … }` or from `--serve` / `--no-serve` on the
command line, with the flag winning. `true` means localhost on whatever port is
free.

```
--serve                on, wherever is free
--serve=8080           on, at that port
--serve=0.0.0.0:8080   on, at that address
--no-serve             off
```

The address is **kept separately from whether to use it**, because the tray can
switch the viewer off and on again and it should come back where it was asked
for rather than wherever happens to be free the second time. `HOST` and `PORT`
in the environment still work, and lose to an explicit address.

## the express app is always real

This used to hand back a stub whose every verb returned itself, so a plugin could
mount a route in a packaged build without asking which build it was in. That was
the right instinct and the wrong mechanism: **a stub can never be switched on**,
and the tray's toggle needs exactly that. A real express app that nothing can
reach costs a few objects and behaves identically.

Mount on `http.router`, not on the app itself — the whole set of routes is thrown
away and rebuilt when the server half reloads, and mounting on the app stacks a
second copy of every route on every save.

## two failures it will not hand you

**Stopping cannot hang.** `server.close()` does not call back while a connection
is still open, and `closeAllConnections` is not on every node this might run
under — so on one without it, turning the viewer off would never return. That is
a tray item stuck forever and, worse, an `await` in the node half that takes a
whole test run with it. It is raced against a three second deadline, and both
outcomes are said.

**A failed change puts the answer back.** Leaving `serving` true because
`listen()` threw would draw a tick beside a menu item for a server that is not
there.
