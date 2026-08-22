# http

One express app, one server, and **two separate facts about it**.

| file | provides | consumes |
|---|---|---|
| `main.js` | `http` | `app`, `ipc` |
| `cli.js` | — | `cli`, `ipc` |

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

## turning it on and off while it runs

```
npm run cli -- serve        what it is now, without changing it
npm run cli -- serve on     ... and off, start, stop, yes, no
```

The tray has the same switch as a checkbox. Both call `setServing`, so there is
one implementation and the menu redraws from the real state whoever moved it.

**A bare `serve` asks rather than toggling.** A toggle would be a trap in a
script: the same command twice leaves it where it started.

The command exists only because the words matter — `../cli` forwards anything
its table does not know, so `serve '{"on":true}'` already reached here. What it
did not do was read like something a person types, print the address afterwards,
or refuse a word it could not read instead of quietly doing nothing.

## what "off" actually stops

| | serving | off |
|---|---|---|
| socket.io | takes connections | refused, with a reason |
| the app's own routes | served | **503** |
| webpack's bundle and hot reload | served | **served** |
| the nw window | unaffected | unaffected |

**Webpack is exempt, and it has to be.** In development the window fetches its
own page and bundle over http — that is how hot reload works — so page hosting
cannot be switched off without breaking the window it exists to serve. What can
be switched off is everything the app itself answers, which is what stops
anything outside this window reaching it.

So the gate steps over app routes when off and lets webpack's middleware have the
request; whatever webpack does not recognise is refused at the end of the chain
with a **503 rather than a 404**, because *off* and *not a route* are different
facts and a log deserves to say which.

In a packaged build there is no webpack and nothing to exempt, so off means no
port at all — and **on** means [build](../build/) mounts the three routes a
browser needs: the page, the window half out of memory, and the stylesheets from
disk. Until it did, `serve on` in a package opened a port where every request
answered 404, and nothing noticed: the app's own window loads `view.html` off
disk and never asks the server for anything.

## and whether it may serve at all

```json
"app": { "serve": false, "canServe": true }
```

Two different questions, and only one of them is a setting.

**`serve`** is the runtime default — what this build does on startup, overridable
by `--serve` and by the tray and the cli while it runs.

**`canServe`** is decided when the binary is built. `false` means the packaged
app does not *contain* the ability: `webpack.config.js` turns it into a
`BUILD_SERVABLE` constant, and webpack folds away every branch behind it — the
routes in [build](../build/) and the socket.io server in [io](../io/) are not in
the file. **A runtime flag can be flipped by whoever runs the app; this cannot be
flipped by anybody, because there is nothing left to flip.**

Measured: `canServe: false` took `main.bin` from 8,014,504 to 7,456,928 bytes.
That only happened once the `require` was gated and not just the call — webpack
collects a dependency wherever it can reach it, so `new Server(…)` behind a
constant still dragged the whole of socket.io in, and the refusal below would
have been claiming something untrue.

**The refusal is loud.** `setServing(true)` throws and names the manifest key,
`npm run cli -- serve on` prints it, and the tray does not offer an item it
cannot honour — the same reasoning as the two Inspect items being absent from a
package. A switch that appears to work and does nothing is worse than one that is
not there: the point of building without the ability is that somebody can be
sure, and silence is not proof of anything.

Development always has the ability, whatever the manifest says. Taking it away
from the source tree would only mean the thing you develop against is not the
thing you ship.

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
