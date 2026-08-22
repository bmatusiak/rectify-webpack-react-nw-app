# rectify-webpack-react-nw-app

Minimal scaffold: a [rectify](https://github.com/bmatusiak/rectify) plugin app,
bundled by webpack, rendered with React, running live inside an nw.js window.

`webpack-rectify-react` (plugin architecture + theme kit) merged with
`react-nw-app` (nw.js shell). In development nw.js runs the code in `src/`;
The nw window talks to main over a direct channel in every build, so the app's
own traffic never goes over a port; http is there for webpack in development and
for an optional browser viewer. `npm run build` compiles it into a package that
keeps no javascript on disk — see [building a package](#building-a-package).

## four contexts, one folder of plugins

A plugin is a folder in `src/app/`, and the files inside say where it runs:

```
src/
  main.js       boot: nw's node context. loaded off disk, never bundled
  main.prod.js  boot: the same, from the bundle, when packaged
  server.js     boot: the app's node half. bundled, reloaded on every save
  window.js     boot: the browser. bundled, hot reloaded
  cli.js        boot: plain node. a terminal talking to a running app
  boot.js       the startup order, shared by both main boots
  config.js     settings, sliced per plugin
  index.html
  overlay.js    the message drawn over a page whose boot threw
  serve.js      whether a browser may be a client, and where
  target.js     which suites a targeted test run should take
  app/          the plugins, below
```

**Every plugin carries its own README.** This one is about the app; those are
about the parts, and `test/readme.test.js` reads their tables back off the
source so they cannot quietly stop being true.

### `core/` — how the app talks to itself and the outside

| plugin | contexts | what it is |
|---|---|---|
| [lifecycle](src/app/core/lifecycle/) | `main` | shutdown, crashes, the instance file |
| [http](src/app/core/http/) | `main` | express and the swappable router. Nothing, in a package |
| [io](src/app/core/io/) | `main` `server` `window` | one `io` fanned out over every transport there is |
| [bridge](src/app/core/bridge/) | `main` | the direct channel between main and the window |
| [ipc](src/app/core/ipc/) | `main` `server` `cli` | the control socket, and its token |
| [appPackage](src/app/core/appPackage/) | `server` `window` | the app's own name and version |
| [cli](src/app/core/cli/) | `cli` | the command table |
| [window](src/app/core/window/) | `main` `server` `cli` | the nw window, and photographs of it |
| [tray](src/app/core/tray/) | `main` `server` | the icon, and the menu others add to |
| [devtools](src/app/core/devtools/) | `main` | the two Inspect items |
| [build](src/app/core/build/) | `main` | webpack, and the reload |
| [react](src/app/core/react/) | `window` | `createRoot`, once |
| [storage](src/app/core/storage/) | `window` | the `session` and `settings` stores |
| [selftest](src/app/core/selftest/) | all four | running the suites in place |

### `ui/` — what is on screen

| plugin | contexts | what it is |
|---|---|---|
| [ui/theme](src/app/ui/theme/) | `window` | the theme kit: components, swatches, light/dark |
| [ui/editor](src/app/ui/editor/) | `window` | ace and ace-diff: code that is read, and a change that is judged |
| [ui/markdown](src/app/ui/markdown/) | `window` | marked, rendered where it cannot do anything |
| [ui/xterm](src/app/ui/xterm/) | `window` | a terminal: bytes that arrived from somewhere else |
| [ui/litegraph](src/app/ui/litegraph/) | `window` | a graph: things, and what connects them |
| [ui/banner](src/app/ui/banner/) | `window` | something true about the app, said across the top of it |

Four of those five wrap a vendored library in its own `vendor/` folder, and each
is a slot: swap one and the pages that use it are the only thing that changes.
[banner](src/app/ui/banner/) is the odd one — it wraps nothing and consumes the
theme, because it is a composition *of* the kit rather than a surface beside it. `webpack.config.js` keeps every `vendor/` folder away from babel —
these are shipped builds, and babel rewriting a top-level `this` breaks a UMD
file on its first line.

### the rest

| plugin | contexts | what it is |
|---|---|---|
| [remote](src/app/remote/) | `server` `window` `cli` | click, fill and read the page |
| [demo](src/app/demo/) | `server` `window` `cli` | the example app. Delete this one |

**Two levels, and no more.** `src/app/demo/window.js` and
`src/app/core/io/window.js` are both found; nothing three deep is ever looked
at, which is what keeps `ui/theme/swatch/*` out of it. A folder starting with
`_` or `.`, or named `vendor`, is skipped.

Beside each of those sits a `<context>.test.js` where there is one — a test that
is itself a plugin, run inside the running app. See [testing](#testing).

Each boot gathers its own half and nothing else:

```js
//src/window.js
var found = require.context('./app', true,
    /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.(js|jsx)$/);
var plugins = found.keys().map(found);
```

So **the folder is the registry**. Adding a plugin is creating a folder; there
is no list to update, and no way to add one in a place that forgets it. Rename
a folder with a leading `_` and it stops loading.

**The filename is the branch.** There is no `isServer` or `isBrowser` test
anywhere in a plugin, because a file that only exists in one bundle cannot run
in the other — and the window bundle never even parses the server half. That
also means editing a `server.js` no longer reloads the page: it is not in that
bundle.

### how the halves join

They are four separate rectify apps with four service graphs, so a plugin
that spans runtimes joins itself:

- `window/main.js` owns the real nw window and provides `window` on the main
  graph. `window/server.js` provides `window` on the app graph, wrapping a
  controller handed over from main. Same name, same meaning, different process.
- `tray/` does the same for the tray.
- `io/main.js` fans one `io` out over every transport there is -- the bridge for
  the nw window, socket.io for a browser -- `io/server.js` registers the handlers
  once, and `io/window.js` picks the transport this view is on. The latter two
  share `serve.js`, which is the one function `?mock` runs in the page.
- `ipc/` is what the fourth graph joins through: `ipc/main.js` listens on the
  control socket, `ipc/cli.js` provides the same `ipc` name in a terminal
  process that dials it. `window/cli.js` and `remote/cli.js` are then written
  against `ipc` and know nothing about where the app is.

Main hands the app side a **host** object — `express`, `router`, `httpServer`,
`io`, `appPackage`, and controllers for `window` and `tray` — and it arrives as
`app.host`. Under one key on purpose: rectify's own `services.app` already
carries `window` (the dom window, or `global` in node), `services`, `on`,
`emit` and the `is*` flags, so anything spread in there is one name away from a
collision that looks like it works.

The startup order lives in `src/boot.js`, shared by both main boots, rather
than inside whichever plugin happens to depend on all the others:

```js
await services.build.ready();          //first bundle built and loaded
var url = await services.http.listen();
services.lifecycle.publish(url);       //tools/nw.js reads this
services.tray.start();
services.window.open();
```

Teardown is rectify's: `lifecycle.shutdown()` calls `app.destroy()` and every
plugin's `onDestroy` runs in reverse.

### why main.js sits at the root

`main.js` in the root is three lines that require `src/main.js`. nw.js loads
the manifest's `main` into a generated background page at the app root and
resolves that script's requires from the root rather than from the file's own
directory, so a boot living in `src/` cannot require its neighbours without it.

## building a package

```
npm run build   production bundles, compiled, staged into build/app
npm run dist    build, then nw-builder -> build/out
```

`npm start` runs whichever of the three you ask for, and each is strictly later
output than the one above it — so something that works in the first and not the
third narrows to the step between them:

```
npm start              the source tree. webpack in memory, both halves reload
npm start -- --build   build/app: the compiled main.bin, run by the sdk runtime
npm start -- --package build/out: the executable, exactly what a user runs
```

What comes out has **no javascript on disk**: a manifest, two html files with
nothing executable in them, `main.bin` compiled by `nwjc`, the stylesheets, and
an icon. The window half rides inside the binary as a string and is evaluated
into the page, and it talks to main over [bridge](src/app/core/bridge/).

**By default it opens no port either.** The browser viewer is off unless
`package.json` says `"app": { "serve": true }` or the app is started with
`--serve`, and the tray can switch it while the app is running — see
[http](src/app/core/http/). The tray loses its two Inspect items in a package —
see [devtools](src/app/core/devtools/).

**It is not encryption.** It means the app runs what it shipped with: there is
no `.js` to edit and no `node_modules` to shim. The window half is still
delivered to a browser context to run, so it is readable by anyone who opens
devtools, as any client code is.

The pipeline, why the packaged app boots differently, what does and does not
survive the move, and how the release workflow builds all three platforms:
[tools](tools/).

## rectify, as used here

`src/config.js` is attached as `plugins.config` and reaches each plugin as its
third setup argument, keyed by service name. The second argument to `build()` is
the host object, merged onto the `app` service: anything the process knows that
a plugin cannot work out for itself. And **the load order is not in any list** —
it falls out of `consumes`/`provides`.

### Plugin, when a plain object is not enough

Rectify ships a base class **as a plugin rather than as part of the container**,
so every boot puts `rectify.PluginBase` in its list and a plugin that wants it
says `consumes: ['Plugin']` like any other dependency.

Four plugins here use it, all for the same reason: **`own`**. Teardown is
written beside the thing being undone rather than in a block at the far end of
the file, and runs in reverse.

```js
var self = new imports.Plugin('ipc');

fs.writeFileSync(tokenFile, secret, { mode: 0o600 });
self.own(function () { fs.unlinkSync(tokenFile); });
```

That matters more here than it looks. The node half is **torn down and rebuilt
on every save**, so a listener left behind is a second copy answering the next
command — and `src/app/core/ipc` alone owns four separate resources whose ordering
used to be implied by where the lines happened to sit.

`self.api(surface)` is the other half: it copies the surface onto the instance
with `Object.defineProperty`, so **getters stay getters** — `window.url` and
`window.isOpen` are still live reads — and freezes it. What gets registered is
the plugin itself, an emitter with a stated set of methods.

**What this scaffold does not use is `ready`**, which is the feature the base
class is really for: a plugin cannot otherwise know when the whole load has
finished. It does not fit here because our order is not "everything loaded" but
"everything **started**" — `tray.start()` wants `http.url`, and nothing has
listened yet when the load completes. That sequence stays in
[src/boot.js](src/boot.js), in one readable place. An app whose plugins start
themselves should use `ready` and delete most of that file.

## the cli

```
npm run cli                    what it understands
npm run cli -- status          is the app up, and where
npm run cli -- open            bring the window back
npm run cli -- capture         photograph the window
npm run cli -- views           what is open to be driven
npm run cli -- click Save      press something in it
npm run cli -- fill "#name" Bo type into it
npm run cli -- quit            shut it down
npm run cli -- hello '{"a":1}' anything the app answers, with json in
```

`src/cli.js` is a fourth boot, run by plain node with no nw.js and no window.
It gathers every `src/app/*/cli.js`, exactly as the other three gather their
own halves.

A command can name what it takes, so the common case is typed the way it is
spoken -- `click Save` rather than `click '{"selector":"Save"}'`. Json still
wins when the names do not cover what you want to say.

**A command is local unless it is not.** Anything the table does not know is
forwarded to the running app over its control socket, so a plugin that answers
on `ipc` is reachable from the terminal **without a `cli.js` at all**.

The pieces, each documented where it lives:
[cli](src/app/core/cli/) the table ·
[ipc](src/app/core/ipc/) the socket and its token ·
[window](src/app/core/window/) `open`, `hide`, `quit`, `capture` ·
[remote](src/app/remote/) `click`, `fill`, `read`, `views`.

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
npm start        # nw.js: node context + window, and waits until it is up
npm run cli      # talk to a running app over its control socket
npm run log      # what that app has been saying, minus chromium's noise
npm test         # everything, or one thing -- see testing
npm run drive    # open every page and measure it, in one swatch or all 28
npm run build    # production bundles, compiled and staged into build/app
npm run dist     # build, then nw-builder -> build/out
```

`npm start` and `npm run drive` both take `--build` and `--package` to run what
those two produced — see [building a package](#building-a-package).

The app runs under nw.js and only under nw.js. There is no plain-node mode, and
dropping it took about a dozen "might not have a window" branches out of the
plugins: the host always carries a window, a tray and a control socket, so
nothing has to ask.

`npm start` hands the terminal back once the app is up, and the app keeps
running. Run it again and it says so, and brings the window back:

```
$ npm start
launching node_modules/nw/nwjs-sdk-v0.114.2-win-x64/nw.exe  (source)
logging to nw.log  (--attach to watch it live)
up at http://localhost:53851/

$ npm start
already running (pid 35788) at http://localhost:57539/
bringing its window to the front
```

It waits for one of three things rather than returning blind: the app says it is
up, the app exits, or thirty seconds pass. **A boot that throws prints its stack
and leaves 1**, which is worth the two or three seconds it costs — the
alternative looked exactly like a working start, and cost a two and a half
minute wait on a process that had died in the first second.

```
$ npm start
it exited (code 0) before it came up.

  [main] a plugin failed to start Error: Cannot find module 'nope.js'
      at Object.plugin (src/app/core/build/main.js:77:23)
```

### reading the log

The app is launched detached with its output going to `nw.log`, so that file is
the only account of what it did — and it is mostly chromium describing its own
startup. `npm run log` shows what the app itself said, unwrapped, most recent
last:

```
$ npm run log
Uncaught TypeError: Cannot read properties of null (reading 'nope')
 An error occurred in the <Blog> component.
```

`--all` for everything, `-f` to keep watching, a number for how many lines. See
[tools](tools/).

## testing

```
npm test                     everything
npm test -- window           only the browser suites
npm test -- core/ipc         only that plugin, wherever it has tests
npm test -- core/ipc/main    only that plugin, in one context
npm test -- node             only what needs no app
npm test -- requires         only test/requires.test.js
npm test -- --list           what there is to aim at
```

Tests live in two places, and the split is not filing — it is about what can be
answered where.

**`test/`** holds what needs no app: the shape of the tree, the build, pure
logic. Three of those carry more than their own subject:

- `plugin-scan.test.js` keeps the five discovery sites agreeing about what a
  plugin is. One taking a file the others miss is a plugin that runs in
  development and not when packaged, and nothing says a word about it.
- `requires.test.js` resolves every relative require that climbs out of its own
  folder. Moving a plugin one level changes what `../../..` means, and a
  main-side require is read off disk by nw at boot — so nothing else catches it.
  Regrouping under `core/` broke four and left the suite green.
- `server-graph.test.js` builds the real server entry with webpack and boots it.
  It is the only place the bundled node half runs outside nw.

**Beside each plugin** sits `<context>.test.js` — a test that is itself a
plugin. It consumes the services it is about, so the container hands it the real
ones and loads it after whatever made them: nothing to mock, and no second
wiring to keep in step.

```js
//src/app/my-thing/server.test.js
plugin.consumes = ['selftest', 'my-thing'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;

    describe('my-thing, in the running app', function () {
        it('answers', async function () {
            assert.ok((await imports['my-thing'].ask()).ok);
        });
    });

    register();
}
module.exports = plugin;
```

Those run **inside the app**, in the context they belong to — `main` wants nw
around it, `window` wants a document and a stylesheet that really loaded,
`server` wants the actual host rather than a stand-in. The harness has `ok`,
`equal` and `notEqual` and **no `deepEqual`**, because these run somewhere that
is not always node. How the four contexts are collected, and why the harness is
a service rather than a module, is in [selftest](src/app/core/selftest/).

`test/selftest.test.js` closes the chain: it starts the app if none is up, asks
it over the control socket for all four contexts, and reports each as a subtest.
An app that was already running is left alone in both directions — not shut down
if it was not started here, and not restarted just to collect its suites.

`.github/workflows/test.yml` runs the whole thing on every push, on all three
platforms. On a headless linux runner it goes under `xvfb-run`: nw.js is
chromium and wants a display. If it fails there, `nw.log` is printed and kept as
an artifact — on a machine nobody can look at, that is the only account of what
the app was doing.

### the loop

**Leave the app running.** In development every context loads its test plugins
as it starts, so a running app can be asked for any of them at any time:

```
$ npm start
up at http://localhost:53851/

$ npm test -- ui/theme          # about a second, against the open window
only ui/theme/window
ℹ pass 8
```

Webpack reloads both halves on save, so an edited test is in the app before you
can ask for it. That is the loop: change something, run one test, read what came
back, change it again, without restarting anything.

Targeting happens **when the run is asked for**, not when the app starts.
`src/target.js` tags each suite with the plugin that registered it and
`run({ only })` filters on that. A flag deciding what to *load* would mean
restarting the app to change target, which is the thing this avoids.

**A packaged build cannot load its own tests.** Each `require.context` for them
sits inside a check webpack drops, and `src/main.prod.js` has no equivalent path
at all. `npm run drive -- --build --selftest` says so rather than reporting three
empty contexts as failures.

### driving the real app

`npm run drive` is the only check that can see the window: it starts the app,
opens every page over the control socket, and measures every heading, every piece
of muted text, every inline `code` and every alert against WCAG's 4.5, optionally
in every swatch. It earns its place — it found the active sidebar pill unreadable
on thirteen of the twenty-eight swatches, and later found inline code at 1.49:1
inside an alert on four pages, which nothing in `test/` could have.

**What it measures is what stays fixed.** Both of those lived for as long as they
did because this only ever looked at headings and muted text. See
[tools](tools/).

## adding a plugin

Make a folder under `src/app/` and put in the halves you need. Nothing to
register:

```
src/app/my-thing/
  server.js       runs in the node half
  window.js       runs in the window
  server.test.js  a test, itself a plugin, run inside the app
  README.md       what it is
```

Two of those are checked. `test/readme.test.js` fails if the README is missing
or its table disagrees with the source, and the audit for a missing test is one
command:

```sh
for c in main server window cli; do
  for f in $(find src/app -name "$c.js" -not -path "*/core/selftest/*"); do
    [ -f "$(dirname $f)/$c.test.js" ] || echo "$f has no tests"
  done
done
```

```js
//src/app/my-thing/server.js
plugin.consumes = ['app', 'appPackage'];
plugin.provides = ['my-thing'];
async function plugin(imports, register) {
    imports.app.host.router.get('/api/my-thing', ...);

    await register(null, {
        'my-thing': {},
        onDestroy: function () { /* undo it, this half reloads */ }
    });
}
module.exports = plugin;
```

Service names are the contract between halves and between plugins; rectify
resolves the order from `consumes` and `provides`, so the order of the folders
never matters.

Three things worth deciding before writing one, each learned the hard way and
each written up where it bit:

- **A service is one idea.** Do not register something under a second name
  because that is how it happens to arrive — see [appPackage](src/app/core/appPackage/).
- **Bundle only what is genuinely one thing.** `storage` provides two stores from
  one factory because neither can change without the other. The test is whether
  one can; if it can, it is two plugins.
- **Do not name a service `config`**, and do not name a store field `save` — see
  [storage](src/app/core/storage/).

A plugin that provides nothing is normal: [devtools](src/app/core/devtools/),
[remote](src/app/remote/)'s two outer halves and all of [demo](src/app/demo/) do.
They still declare `provides: []` and still call `register()`.

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

All four boots listen for rectify's `error`. Without that the emit throws with
no indication of which plugin died. `src/boot.js` logs it for both main boots,
`src/server.js` logs and rethrows so a broken node half fails the reload loudly
instead of half-starting, `src/cli.js` prints it and exits non-zero, and
`src/window.js` puts it at the top of the page rather than leaving you a blank
one.

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
- **`window` and `document` exist there.** Which is why a plugin's runtime is
  the file it is in, rather than a test it runs: every global you would sniff
  reports the wrong thing on one side or the other. Rectify's own
  `services.app.window` is that same trap — it is the dom window, or `global`
  in node, and never the app's window.
- `Worker` and `WebSocket` are not available there either.

Everything is in `devDependencies`: the app compiles itself at startup, so
there is no smaller runtime-only install to separate out.
