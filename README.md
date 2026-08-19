# rectify-webpack-react-nw-app

Minimal scaffold: a [rectify](https://github.com/bmatusiak/rectify) plugin app,
bundled by webpack, rendered with React, running live inside an nw.js window.

`webpack-rectify-react` (plugin architecture + bootstrap ui) merged with
`react-nw-app` (nw.js shell). There is no build/packaging step — nw.js runs
everything, and the code it runs is the code in `src/`.

## shape

```
nw.js starts  ->  main.js          node context, no window
                    express + socket.io + webpack-dev-middleware on :8080
                    nw.Window.open('http://localhost:8080/')
                                  ->  the window, its own context, no node
                                      talks back over socket.io
```

`main` in `package.json` is a `.js` file, so nw.js runs it in the node context
and creates no window; `main.js` opens the view itself. The window loads a
remote page, so it gets its own javascript context with no node in it — which
is why `app-server/index.js` and the window talk over socket.io instead of
sharing objects.

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

## layout

```
main.js               nw.js entry, node context: server + window
app-server/index.js   attach point for anything server side, ie gun
tools/nw.js           launcher, finds the nw binary and turns logging on
webpack.config.js
src/
  index.js            starts rectify with the plugin list
  config.js           app config slot
  index.html          <div id="root">
  app/                the example app plugin, delete it and build your own
  core/
    index.js          the core plugin list
    react/            provides `react`   -> createRoot on #root
    storage/          provides `session` + `config` -> typeStore over session/localStorage
    io/               provides `io` + `appPackage`  -> socket.io client
    bootstrap/        provides `bootstrap` + `$`    -> bootstrap 5, scss, icons
      components/     NavBar, Dialog
```

Add app plugins in the array in `src/index.js`:

```js
var app_config = []
  .concat(
    require('./core/index'),
    [
      require('./app/index')
    ]);
```

A plugin declares what it needs and what it exposes:

```js
plugin.consumes = ['react', 'bootstrap'];
plugin.provides = ['my-thing'];
async function plugin(imports, register) {
    await register(null, { 'my-thing': {} });
}
module.exports = plugin;
```

## talking to the node side

`app-server/index.js` gets the express app, with `app.server` (http) and
`app.io` (socket.io) on it. The window gets the connected socket as the `io`
service. The example round trip is `ping` in `app-server/index.js` and the
`io.emit('ping', ...)` in `src/app/index.js`; `appPackage` reaches the window
the same way, because the window cannot read `package.json` itself.

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
- `Worker` and `WebSocket` are not available there either.

Everything is in `devDependencies`: the app compiles itself at startup, so
there is no smaller runtime-only install to separate out.
