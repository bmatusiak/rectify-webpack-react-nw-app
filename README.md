# rectify-webpack-react-nw-app

Minimal scaffold: a [rectify](https://github.com/bmatusiak/rectify) plugin app,
bundled by webpack, rendered with React, running live inside an nw.js window.

`webpack-rectify-react` (plugin architecture + theme kit) merged with
`react-nw-app` (nw.js shell). There is no build/packaging step — nw.js runs
everything, and the code it runs is the code in `src/`.

## shape

```
nw.js starts  ->  main.js          node context, no window
                    builds src/server.js  -> runs the plugins here
                    express + socket.io + webpack-dev-middleware, free port
                    nw.Window.open('http://localhost:<port>/')
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
        app.router.get('/api/thing', ...);        //node half
        return register(null, { thing: ... });
    }

    var res = await fetch('/api/thing');          //browser half
    await register(null, { thing: await res.json() });
}
```

`main.js` hands the host in through rectify's second `build()` argument, which
merges onto the `app` service — so `consumes: ['app']` gets you `app.express`,
`app.router`, `app.expressApp`, `app.httpServer`, `app.io` and
`app.appPackage` on the node side.

Mount routes on **`app.router`**, not on `app.expressApp`. The router is
replaced on every server rebuild, which is what lets routes come and go with a
reload; anything mounted on the app itself stacks up instead.

**Branch on `app.isServer`, not on `app.isBrowser` or `typeof document`.** The
entries set it. nw.js's node context has a `window` with a `document` on it, so
every other test reports that side as a browser and the node bundle then runs
the wrong half.

### the client can mock the server

Because the client bundle contains both halves, the browser can run the server
half itself. `src/core/io/index.js` has one `serve(io, appPackage)` function,
given the real socket.io server on the node side and an in-memory pair from
`src/core/io/mock.js` in the browser. Open a built client with **`?mock`** in
the url and the app comes up with no server behind it, driven by the real
server code rather than a second implementation of it.

It is opt-in on purpose. Falling back to the mock automatically on a failed
connection meant a server that was merely slow to start produced a page that
looked fine and served invented data. Without `?mock`, no server is a visible
error.

## install

```
npm install
```

`nw` is pinned to the `-sdk` build, so devtools work and the flavour is decided
by the version rather than by an `.npmrc` npm now warns about on every command.
If npm blocks install scripts the runtime never downloads — `npm approve-scripts
nw`, then reinstall.

## run

```
npm start        # nw.js: node context + window
npm run dev      # the same server under plain node, it prints the url
npm test         # node --test
npm run typecheck  # tsc --noEmit
```

The port is whatever is free, so two of these can run side by side. `PORT=8080`
pins it.

`npm start` goes through `tools/nw.js`, which passes `--enable-logging=stderr`
so the window's console reaches your terminal. Extra flags pass through:

```
npm start -- --remote-debugging-port=9222
```

Both halves hot reload. The window half goes through webpack-hot-middleware;
the node half is watched too, and on each rebuild `main.js` tears the old one
down and loads the new bundle in place — same process, no restart.

That teardown is why a server half has to clean up after itself. Return an
`onDestroy` alongside what you provide — the same shape as an effect returning
its cleanup:

```js
if (app.isServer) {
    app.router.get('/api/thing', ...);        //router is swapped for you

    return register(null, {
        thing: ...,
        onDestroy: function () {              //anything else, undo it here
            app.io.removeAllListeners('connection');
        }
    });
}
```

Without it a reload stacks a second copy of every listener. There is a test for
exactly that.

`onDestroy` is rectify's own slot: `register()` collects it and `app.destroy()`
runs them, in reverse dependency order, catching so one bad cleanup cannot
strand the rest. It works for any plugin, including one that provides nothing.

### the window is a view, the tray is the app

Closing the window does not quit. It hides, the node half keeps running behind
the tray icon, and reopening is instant with the page state intact — nw quits
when the last window closes whether or not there is a tray, so `main.js`
intercepts `close` and hides instead. Reopen from the tray, by left-clicking it,
or by running `npm start` again; quit from the tray's Quit.

If the tray cannot be created (no status area), the old rule stands: closing
the window quits.

Quitting has to be thorough. `nw.App.quit()` alone does not always manage it —
the http server, socket.io and webpack's watchers are open handles, and the
node context can outlive the window holding them, which leaves a copy running
with nothing on screen and the port taken. So `shutdown()` closes the server,
removes the tray, closes the windows, quits, and then hard exits.

Closing the devtools window does nothing to the app.

### the tray belongs to the app too

`src/core/nw` provides an `nw` service so a plugin can put its own items on the
tray menu:

```js
if (app.isServer && nw) {
    var item = nw.tray.add({
        label: 'Say hello in the log',
        click: function () { console.log('hello'); }
    });

    //nw.MenuItem options all work: type, checked, enabled, submenu, icon, key
}
```

The item comes back off the menu when the plugin is torn down, so a server
reload does not leave a second copy behind — the menu is rebuilt from scratch
each time rather than patched by index. `nw` also carries `url`, `hasWindow`,
`open()`, `hide()`, `openInBrowser()` and `quit()`.

The window and the tray themselves live in `main.js`, not in the plugin: they
have to outlive the server bundle, which is thrown away on every reload. The
plugin wraps that controller and hands back only what it added.

Under `npm run dev` there is no nw.js at all, so the `nw` service is
`undefined` — check for it, the example plugin does.

Two things you will see if a copy is somehow still up:

```
Opening in existing browser session.        # nw.js is single instance. the
                                            # second start woke the first one
                                            # and exited. the window comes back.

port 8080 is already taken. another copy    # only if you pinned PORT.
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
  config.js           app config, reaches plugins as setup's third argument
  index.html          <div id="root">
  rectify.d.ts        the plugin contract, for typescript plugins
  core/               what the scaffold is, and what nw.js needs
    react/            provides `react`   -> createRoot on #root
    storage/          provides `session` + `config` -> typeStore, written in typescript
    io/               provides `io` + `appPackage`  -> socket.io both sides, + mock.js
    nw/               provides `nw`      -> window and tray, node side only
  app/                what this app is. delete it and build your own
    index.js          the example plugin
    theme/            provides `theme`  -> the theme kit, bootstrap 5 here
      components/     NavBar, Dialog
```

`core/` is the parts that do not change when the app does. `app/` is
everything that does — the theme kit included, since a project brings its own.

`theme` is a slot, not a commitment to bootstrap. It carries `navbar`,
`dialog`, `themeSwitcher`, `bs` (the kit itself) and `$` (the kit's dom helper,
jquery here — deliberately not a top level service, since another kit may not
want one). Bring another kit by replacing `src/app/theme/` with one that
carries the same names.

### config

`src/config.js` is the app's settings. Rectify slices it by service name and
hands each plugin its own piece as the third argument to setup, so the theme
plugin reads `config.theme.mode`:

```js
async function plugin(imports, register, config) {
    var mode = config.theme.mode || ...;
}
```

### when a plugin fails to start

Both entries listen for rectify's `error`. Without that the emit throws with no
indication of which plugin died; now it is logged, and in the window it is also
printed at the top of the page rather than leaving you a blank one.

Add plugins in `src/plugins.js`:

```js
module.exports = [
    require('./core/react'),
    require('./core/storage'),
    require('./core/io'),

    require('./app/theme'),
    require('./app'),
    require('./my-plugin')
];
```

## typescript

`.ts` and `.tsx` build with no extra step — babel strips the types and
`resolve.extensions` finds them, so `require('./core/storage')` picks up
`index.ts` exactly as it would `index.js`.

Nothing here is committed to typescript. `src/core/storage` is written in it to
show that it works; every other plugin is plain javascript, and the two sit in
the same plugin list. Pick per plugin, or rename that one to `.js` and have
none at all.

Stripping is not checking. `npm run typecheck` runs `tsc --noEmit` against
`tsconfig.json`, which is `strict`.

`src/rectify.d.ts` names every service in one `Services` interface, so a plugin
declares what it consumes and gets them typed:

```ts
type Imports = import('../../rectify').Imports<'app' | 'config'>;

async function plugin(imports: Imports, register: Register) {
    imports.config('theme', { mode: 'dark' }).mode;//knows it has a mode
}
```

Add a service to `Services` when you add a plugin that provides one.

Two things to know when writing a plugin in typescript:

- **Keep it commonjs.** `module.exports = plugin` at the bottom, and pull types
  in with `type App = import('../../rectify').App` rather than an `import type`
  statement. Any `import`/`export` statement, even a type-only one, leaves babel
  marking the output as an es module, and webpack then rejects the
  `module.exports`. `export = plugin` does not work either — that needs babel's
  commonjs transform, which preset-env deliberately leaves off.
- **Do not reach for ts-loader or fork-ts-checker.** They load the `typescript`
  package, which is esm-only, inside nw's node context. See below. Babel does
  the stripping; `tsc` only ever runs under plain node.

`src/rectify.d.ts` carries the plugin contract — `App`, `Register`, `Plugin`,
`AppPackage`.

## when things break

Failures here are easy to make invisible — a window with nothing in it, or a
node context that has quietly stopped serving. So:

- a plugin that throws during startup is caught by rectify's `error`, logged,
  and printed over the page
- if the server half fails to rebuild, its old handlers are already gone, so
  the node side pushes `server:error` down the socket and the window says so
- an uncaught exception in the node context logs and shuts the app down rather
  than leaving a headless process behind
- reloads are queued, so two rebuilds in quick succession cannot interleave and
  double-register

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
