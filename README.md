# rectify-webpack-react-nw-app

Minimal scaffold: a [rectify](https://github.com/bmatusiak/rectify) plugin app,
bundled by webpack, rendered with React, running live inside an nw.js window.

`webpack-rectify-react` (plugin architecture + bootstrap ui) merged with
`react-nw-app` (nw.js shell). There is no build/packaging step — nw.js runs
everything, and the code it runs is the code in `src/`.

## shape

```
nw.js starts  ->  main.js          node context, no window
                    builds src/server.js  -> runs the plugins here
                    express + socket.io + webpack-dev-middleware on :8080
                    nw.Window.open('http://localhost:8080/')
                                  ->  the window, its own context, no node
                                      src/index.js -> runs the same plugins
                                      talks back over socket.io
```

`main` in `package.json` is a `.js` file, so nw.js runs it in the node context
and creates no window; `main.js` opens the view itself. The window loads a
remote page, so it gets its own javascript context with no node in it.

## two entries, one plugin list

`src/plugins.js` is the one list. `src/index.js` and `src/server.js` both read
it — nothing else declares what loads. Webpack builds both — a `web` bundle served to the window and a `node`
bundle `main.js` loads — so a plugin keeps its server code and its client code
in the same file:

```js
plugin.consumes = ['app'];
plugin.provides = ['thing'];
async function plugin(imports, register) {
    var { app } = imports;

    if (app.isServer) {
        app.expressApp.get('/api/thing', ...);   //node half
        return register(null, { thing: ... });
    }

    var res = await fetch('/api/thing');          //browser half
    await register(null, { thing: await res.json() });
}
```

`main.js` hands the host in through rectify's second `build()` argument, which
merges onto the `app` service — so `consumes: ['app']` gets you `app.express`,
`app.expressApp`, `app.httpServer`, `app.io` and `app.appPackage` on the node
side.

**Branch on `app.isServer`, not on `app.isBrowser` or `typeof document`.** The
entries set it. nw.js's node context has a `window` with a `document` on it, so
every other test reports that side as a browser and the node bundle then runs
the wrong half.

### the client can mock the server

Because the client bundle contains both halves, the browser can run the server
half itself when nothing answers on the wire. `src/core/io/index.js` does this:
one `serve(io, appPackage)` function, given the real socket.io server on the
node side, and given an in-memory pair from `src/core/io/mock.js` in the browser
when the connection fails. Open a built client with no server behind it and the
app still comes up, driven by the real server code rather than a second
implementation of it.

## install

```
npm install
```

`.npmrc` pins `nwjs_build_type=sdk`, so devtools work. If npm blocks install
scripts the runtime never downloads — `npm approve-scripts nw`, then reinstall.

## run

```
npm start        # nw.js: node context + window
npm run dev      # the same server under plain node, open localhost:8080 yourself
```

`npm start` goes through `tools/nw.js`, which passes `--enable-logging=stderr`
so the window's console reaches your terminal. Extra flags pass through:

```
npm start -- --remote-debugging-port=9222
```

The window half hot reloads. The server bundle is built once at startup, so a
change to a plugin's node half needs a restart.

### the view is the app

Closing the window exits the process. `nw.App.quit()` alone does not always
manage that — the http server, socket.io and webpack's watchers are open
handles, and the node context can outlive the window holding them, which leaves
a copy running with nothing on screen and port 8080 taken. So `shutdown()` in
`main.js` closes the server, closes the windows, quits, and then hard exits.

Closing the devtools window does not quit; only the app window does.

Two things you will see if a copy is somehow still up:

```
Opening in existing browser session.        # nw.js is single instance. the
                                            # second start woke the first one
                                            # and exited. the window comes back.

port 8080 is already taken. another copy    # something else has the port.
is probably still running.                  # this one shuts down instead of
                                            # sitting there dead.
```

## layout

```
main.js               nw.js entry, node context: builds, serves, opens the window
tools/nw.js           launcher, finds the nw binary and turns logging on
webpack.config.js     returns [client, server]
src/
  plugins.js          the plugin list, read by both entries
  index.js            entry: runs the list in the window
  server.js           entry: runs the list in the node context
  config.js           app config slot
  index.html          <div id="root">
  app/                the example app plugin, delete it and build your own
  core/
    react/            provides `react`   -> createRoot on #root
    storage/          provides `session` + `config` -> typeStore over session/localStorage
    io/               provides `io` + `appPackage`  -> socket.io both sides, + mock.js
    bootstrap/        provides `bootstrap` + `$`    -> bootstrap 5, scss, icons
      components/     NavBar, Dialog
```

Add plugins in `src/plugins.js`:

```js
module.exports = [
    require('./core/react'),
    require('./core/storage'),
    require('./core/io'),
    require('./core/bootstrap'),

    require('./app'),
    require('./my-plugin')
];
```

## what nw.js's node context will not run

This is the reason for several of the pinned versions. nw.js integrates node's
loop into a chromium render process, and that context is not plain node:

- **ESM-only packages do not load.** `import()` of a bare specifier fails with
  `Failed to resolve module specifier`. Plain node happily `require()`s ESM, so
  these only break under nw.js:
  - `@babel/core` 8 is ESM-only — `transformSync` never returns, it blocks the
    thread forever. Hence babel is pinned to the 7.x line.
  - `sass-loader` 17 is ESM-only — webpack loads loaders with `import()`.
    Pinned to 16.
  - `webpack-dev-server` 6 resolves express with `await import("express")`, so
    `server.start()` never finishes. That is why the bundle is served by
    `webpack-dev-middleware` on our own express app instead.
- **`URL` is not the same class as node's.** `new URL(x) instanceof
  require('url').URL` is `false`. sass-loader's webpack importer trips on this
  ("The canonicalize() method must return a URL"), so `webpackImporter` is off
  and sass resolves `@use "bootstrap/scss/bootstrap"` through `loadPaths`.
- **`--mixed-context` swaps in the browser's timers.** `setInterval()` then
  returns a number with no `.unref()`, which crashes `webpack-hot-middleware`
  on startup. Nothing here does cross-context `instanceof`, so the flag is gone.
- **`window` and `document` exist there**, which is what `app.isServer` is for.
- `Worker` and `WebSocket` are not available there either.

Everything is in `devDependencies`: the app compiles itself at startup, so
there is no smaller runtime-only install to separate out.
