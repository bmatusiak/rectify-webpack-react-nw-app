# build

How the app's two other halves get in front of you.

| file | provides | consumes |
|---|---|---|
| `main.js` | `build` | `app`, `http`, `io`, `window`, `tray`, `ipc`, `lifecycle`, `bridge`, `dataDir`, `log`, `handover` |

```
build.ready()   resolves once the node half is loaded and answering
```

`src/boot.js` awaits that **before** `http.listen()`, so the handlers are up
before anything can connect.

Seven `consumes` is a lot, and it is not a smell here: coordinating the dev loop
is the whole job. Judge a plugin by whether it has one job, not by the length of
its list.

## the two branches

| | development | packaged |
|---|---|---|
| window half | webpack, served from memory, hot reloaded | a string inside `main.bin`, evaluated into the page |
| node half | webpack, `watch()`, reloaded in place | `require`d once, nothing to watch |

**`BUILD_PROD` gates the `require`s directly**, not from inside a function.
Webpack collects a dependency wherever it can reach it, so a `require('webpack')`
in an unreachable function is *still bundled* — and dragging webpack into a
packaged app is exactly what this avoids.

## what a packaged build serves

Nothing, until somebody turns the browser viewer on — and then three things:

```
/                the page a browser gets: a title and an empty <div id="root">
/window.js       the window half, out of memory
/theme/*.css     the swatches, which are files beside the binary
```

**This used to say "nothing to serve, so a packaged build opens no port at
all".** That was true when it was written and stopped being true when serving
became something a package can be asked for — and it stopped *quietly*.
`serve on` opened a port and every request to it answered 404, while the app's
own window carried on working perfectly, because it loads `view.html` straight
off disk and never asks the server for anything. Nobody would have found it
except by opening a browser at a packaged app.

Everything it needs was already here: [bridge](../bridge/) carries the window
half inside `main.bin` as a string, which is what keeps javascript off disk, and
`tools/build.js` leaves the stylesheets beside the binary because 230kb each took
`main.bin` from 4mb to 17mb.

The routes are mounted on `http.router`, so [http](../http/)'s gate covers them:
with the viewer off they are not reachable, which is the whole point of the
switch.

And they are behind `BUILD_SERVABLE`, so a package built with
`"canServe": false` does not contain them at all — see [http](../http/) for the
difference between a switch that is off and an ability that is not there.

## the host

The node half is not part of this graph. It gets one object:

```
isPackaged  root  express  router  httpServer  io  appPackage  window  tray  ipc
```

`window`, `tray` and `ipc` are passed as **controllers rather than the services
themselves**, because they live in `main.js` and have to outlive the bundle being
thrown away. `router` is re-read on every load from `http.swapRouter()`, so the
previous load's routes go with it.

## the reload

1. webpack rebuilds `server.js` and says how long it took
2. the previous graph is `destroy()`ed — every `onDestroy` in reverse
3. the router is swapped
4. `require.cache` is cleared and the new bundle is required

**One reload at a time.** `watch()` fires again while a load is still awaiting,
and two overlapping loads are the double registration all of this exists to
prevent, so they go through a promise queue.

**A failed reload is loud.** The old half is already torn down by then, so the
app is serving the window and nothing else — `server:error` goes down the socket
and the page says so, rather than leaving you looking at a UI whose backend
quietly stopped existing. The *first* build failing rejects `ready()` instead,
which fails the start rather than half-starting.

That teardown is why a `server.js` must clean up after itself:

```js
await register(null, {
    'my-thing': ...,
    onDestroy: function () { imports.app.host.io.removeAllListeners('connection'); }
});
```

Without it a reload stacks a second copy of every listener.
`test/server-graph.test.js` fails the build for it: it boots the real server
graph, destroys it, and checks that nothing still answers.

Editing a `server.js` does **not** reload the page — it is not in that bundle.
