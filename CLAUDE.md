# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm start        # nw, development: main off disk, server and window bundled and reloaded
npm run cli      # a terminal talking to a running app
npm run build    # webpack, production bundles
npm run dist     # build, then package
npm test         # everything: the checks that need no app, then the ones that do
npm test -- window        # only the browser suites
npm test -- core/ipc      # only that plugin, in every context it has one
npm test -- --list        # what there is to aim at
npm run log      # what the running app has been saying, minus chromium's noise
npm run drive    # start the app, drive it, check what only the real app can answer

npm start -- --serve             # and let a browser be a client, on a free port
npm start -- --serve=8080        # ... at that port
npm start -- --serve=0.0.0.0:80  # ... at that address
npm start -- --no-serve          # off, whatever the manifest says
```

**The nw window never uses http for its own traffic.** It talks to main over
`core/bridge` in every build. In development http is still there -- webpack
serves the window half over it and hot reloads it -- but the app's own messages
do not go over a port. Turn the browser viewer off and you are running the code
path a package ships with.

`"app": { "serve": true }` in package.json is the other way to say it, and the
flag wins. `"app": { "canServe": false }` is a different question: it is decided
at BUILD time and becomes the `BUILD_SERVABLE` constant, so webpack folds the
routes and the socket.io server out of the binary entirely. A runtime flag can be
flipped by whoever runs the app; that one cannot be flipped by anybody. Asking
such a build to serve throws and names the key rather than quietly doing nothing.
Development always has the ability. `src/serve.js` answers `false` or `{host, port}`. The tray has a
**Serve to a browser** checkbox that switches it while the app is running.

Call the cli as `node src/cli.js <cmd>` when driving the app yourself, not
`npm run cli --`: npm adds ~530ms per call and buries the real exit code and
stderr behind its own. Poll for readiness rather than sleeping -- incremental
rebuilds are 55-150ms, a cold start is driveable in ~3.6s, and a server-half
reload recovers in ~3.2s.

**Leave the app running.** In development every context loads its test plugins as
it starts, so a running app can be asked for any one of them at any time --
`npm test -- ui/theme` against an open app takes about a second. Webpack reloads
both halves on save, so an edited test is in the app before you can ask for it.
That is the loop: change something, run one test, read what came back, change it
again, without restarting anything.

`npm run drive` takes the same `--build` / `--package` as `npm start`, plus `--shots` to
keep a screenshot of every page and `--swatches` to check all twenty-eight rather than
three. It leaves the app running if it already was, and shuts it down if it started it.

## The four contexts

An app here is four processes, and a plugin is a folder that answers to as many of them as
it has something to say to. The filename says which:

| file | runs in | notes |
|---|---|---|
| `main.js` | nw's node side | off disk in development, bundled by `main.prod.js` when packaged |
| `server.js` | the app's node half | bundled, and reloaded on every save |
| `window.js` | the browser | the only code that reaches the page |
| `cli.js` | a separate terminal process | talks to a running app over ipc |

The same service name can be provided in several contexts by different files -- `io`,
`ipc`, `tray` and `window` all are. That is not duplication: it is one interface with an
implementation per side, and every plugin consuming it is written once and works in all of
them. When adding a service that both halves need, ask what it is on each side before
deciding it can only exist on one.

## Where the documentation is

**Every plugin folder carries a `README.md`** -- what the plugin is, a table of
its contexts with `provides`/`consumes`, and the things about it that took
measuring. Read that one before changing a plugin; the root `README.md` is about
the app, not the parts.

`test/readme.test.js` fails if a plugin has no README, if its table lists the
wrong contexts, or if its `provides`/`consumes` disagree with the source -- the
table is read back off the plugin files. **A new plugin needs a README with a
correct table, or the suite goes red.**

Prose in a plugin README is not checked, so when you change behaviour, change
the paragraph about it too.

## Where a plugin goes

```
src/app/
  core/<name>/     the plumbing: how the app talks to itself and the outside
  ui/<name>/       what is on screen
  demo/            the example app, deletable in one go
  remote/          a feature, beside the groups rather than inside them
```

**A `vendor/` folder inside a plugin is that plugin's own library.** `ui/editor`,
`ui/markdown`, `ui/xterm` and `ui/litegraph` each carry one -- `ui/editor` two,
ace and ace-diff, both built rather than fetched. Two rules follow:
the plugin discovery regexes skip a `vendor` level, so nothing in there is ever
loaded as a plugin; and `webpack.config.js` excludes every `vendor/` path from
babel, because these are shipped builds and several are UMD, where babel
rewriting a top-level `this` to undefined throws on the first line.

One folder per plugin, one file per context inside it, plus whatever that plugin's own
helpers are (`io/serve.js`, `ipc/endpoint.js`, `bridge/wire.js` -- files with no
`provides`, required by the plugin next to them).

**Two levels, and no more.** `src/app/demo/window.js` and `src/app/core/io/window.js` are
both found; nothing three deep is ever looked at, which is what keeps
`ui/theme/swatch/*` out of it. A folder starting with `_` or `.`, or named `vendor`, is
skipped -- rename a folder with a leading underscore to park a plugin without deleting it.

**The demo must keep loading.** It is what you see when the scaffold is cloned. Do not
park it behind an underscore; its own folder is what makes it easy to delete.

**Adding a plugin is adding a folder.** Nothing lists them: `src/main.js` and `src/cli.js`
walk the tree off disk, and `src/server.js`, `src/window.js` and `src/main.prod.js` hand a
regex to `require.context`. Which means:

- Those five must agree about what a plugin is. One taking a file the others miss is a
  plugin that runs in development and not when packaged, and nothing says a word about it.
  `test/plugin-scan.test.js` holds them to one answer; it reads the regexes out of the
  source rather than restating them.
- Moving a plugin folder breaks whatever requires it by path. The tests do
  (`test/*.test.js` reach into `src/app/core/...`), so run `npm test` after any move.

## What goes in a plugin, and what does not

**A service is one idea.** Do not register something under a second name because that is
how it happens to arrive. `appPackage` used to be registered by `io` -- in the window it
comes over the socket, so it was convenient -- and the effect was that wanting the app's
name meant consuming a socket. It is its own plugin per context now: `io` keeps the
handshake payload on the connection, `core/appPackage/window.js` hands it out, and
`core/appPackage/server.js` takes it off the host. Consumers did not change, which is the
sign it was the right cut.

**Bundle only what is genuinely one thing.** `core/storage/window.js` provides both
`session` and `settings`: two stores from one factory, differing only in which browser
storage they sit on. Splitting those would be dogma. The test is whether one can change
without the other -- if it can, it is two plugins.

**Two kinds of `.css`, and they must not share a rule.** The swatches under
`ui/theme/swatch` and vanilla bootstrap are emitted as files the kit swaps
between at runtime; every other stylesheet belongs to the plugin that required it
and is injected by style-loader. They were one rule, which named every `.css`
after the swatch folder it came from -- so the second stylesheet that came from
no swatch folder broke the build outright with "Multiple chunks emit assets to
the same filename". `webpack.config.js` splits them by path.

**Do not name a store field `save`.** `settings(...)` and `session(...)` return an object
whose own writer is `save()`, and the loop that defines the rest skips a default of that
name rather than shadowing it. A checkout field called `save` was therefore the function,
which react received as `checked` and complained about into a console nobody was reading.
It warns now, and `demo/window.test.js` is what found it.

**Do not name a service `config`.** Every plugin already receives a `config` as its third
setup argument: its own slice of `src/config.js`, keyed by what it provides. A service by
the same name puts two different things called `config` in one function, which is why the
localStorage store is called `settings`.

**A plugin that provides nothing is normal.** `demo/*`, `remote/*` and `core/devtools`
exist only to add to other plugins. They still declare `provides: []` and still call
`register()`.

**A plugin that consumes a lot is not automatically wrong.** `core/build` takes seven
services because coordinating the dev loop is what it is for. Judge it by whether the
plugin has one job, not by the length of the list.

## The window transport, and what it cost to get right

Four things about `core/bridge` are load-bearing and none of them are obvious.
All four were found by the app misbehaving, not by reading:

- **`document-start` and `document-end` fire for every frame**, iframes
  included, and the object handed over is that frame's Window either way. The
  demo's Markdown page renders into a `srcdoc` iframe, and main repointed at it.
  A frame answers this about itself: a top-level document is its own `parent`.
  Comparing against `win.window` is wrong -- during document-start for a new
  document it still refers to the old one.
- **`document-start` does not fire again on a reload.** Webpack full-reloads
  whenever it cannot hot swap, so main puts `__host` back on `loaded` too, and
  `io/window.js` waits about half a second for the bridge rather than deciding
  on its first look.
- **A reloaded page is a new client.** The old socket has to be closed or
  `connection` never fires again, `serve.js` never sends the handshake, and the
  page sits on a white screen with no error anywhere.
- **Delivery is a microtask.** A direct call is synchronous and postMessage was
  not; main answers `hello` by firing `connection`, so a synchronous delivery
  arrives before `io/window.js` is listening. A socket never delivers in the tick
  it was sent, and neither does this.

## Rectify, as used here

- All four boots push `rectify.PluginBase` into the config array, so a plugin may declare
  `consumes: ['Plugin']` and build its service on `new Plugin(name)` -- an emitter, a
  `ready` it can act on, and `own()` for teardown collected where it is created. Register
  `onDestroy: self.unload` and `app.destroy()` drives it. Nothing is obliged to use it.
- `src/config.js` is attached as `plugins.config` and reaches each plugin as its third
  setup argument, keyed by service name.
- The second argument to `build()` is the host object, merged onto the `app` service:
  anything the process knows that a plugin cannot work out for itself.
- The load order is not in any list. It falls out of `consumes`/`provides`, and
  `src/boot.js` is where the app is driven once everything has registered.

## Tests

`npm test` is the whole chain. Most of `test/` is what can be answered **without a running
app** -- the shape of the tree, the build, pure logic -- and then `selftest.test.js` starts
the app and asks it to run the suites that live beside each plugin. Four contexts, one
command, and `.github/workflows/test.yml` runs it on every push.

On a headless linux runner that needs `xvfb-run`: nw.js is chromium and wants a display.

`test/selftest.test.js` leaves an app that was already running alone, in both directions. It
does not shut down something it did not start, and it does not restart one that was started
without `--selftest` just to get its suites -- those three contexts are reported as skipped,
with the reason, rather than failing or quietly passing.

Three of the rest are load-bearing beyond their own subject:

- `server-graph.test.js` builds the real server entry with webpack and boots it against
  express and socket.io. It is the only place the bundled node half is exercised outside
  nw, so a broken `require.context` regex or an unresolvable server graph fails here.
- `plugin-scan.test.js` keeps the five discovery sites in agreement, and checks that both
  one-level and two-level plugins are found and that `_`-prefixed folders are skipped.
- `requires.test.js` resolves every relative require in `src/` and `tools/` that climbs
  out of its own folder. Moving a plugin one level changes what `../../..` means, and a
  main-side require is read off disk by nw at boot -- so nothing else here catches it.
  Regrouping under `core/` broke four of them and left the suite green.

`npm run drive` is the other half of it: start the real app and drive it over its own
control socket -- every page opened, every heading and every piece of muted text measured
for contrast, optionally in every swatch. It is the only check that can see the window, and
it earns its place: it found the active sidebar pill unreadable on thirteen of the
twenty-eight swatches, which nothing in `test/` could have.

**A number that moves is not a result.** Three separate things here need waiting for
rather than a fixed delay: a captured frame (the compositor), a crash report (the log
reaching disk), and a swatch (the stylesheet, then the mode following it). Measuring a
swatch after 900ms read text coloured for one mode against a ground painted for the other
and reported a perfectly readable sidebar at 1.5:1, twelve times in a row. Wait for the
value to stop changing.

## Tests that live beside the plugin

A plugin may carry `<context>.test.js` next to its `<context>.js` -- a test that is itself a
plugin. It consumes the services it is about, so the container hands it the real ones and
loads it after whatever made them: nothing to mock, and no second wiring to keep in step.

```js
plugin.consumes = ['selftest', 'cli'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;

    describe('what it does', function () {
        it('does it', function () { assert.ok(imports.cli.command); });
    });
    register();
}
```

**`selftest` is a service, not a module.** `require('@bmatusiak/rectify/harness.js')` exports
one shared instance, and in development `main` and `server` are the same node process -- both
contexts collected into one set of suites and each reported the other's results as its own.
`src/app/core/selftest/<context>.js` calls `harness.create()` and hands out its own, so a test
belongs to a context by consuming the one in that graph.

The harness has `ok`, `equal` and `notEqual` and **no `deepEqual`** -- these run inside the
app, which is not always node.

## All four contexts run inside the app

`npm test` and `npm run drive -- --selftest` both ask the running app to run the suites that
live beside each plugin, and report each one. `npm test` does the same through `test/selftest.test.js`,
and both go through `tools/selftest.js` -- the walk, the cli graph, the launcher and the wait
are written once, or the day one is fixed the other keeps the old behaviour.

| context | where its suites run | loaded when |
|---|---|---|
| `main` | nw's node side | always, by `src/main.js`. That boot is never packaged |
| `server` | the node half | always in development; `src/server.js` gates on `NODE_ENV` |
| `window` | the page | always in development; `src/window.js` gates on `NODE_ENV` |
| `cli` | the runner's own process | `tools/test.js` and `tools/drive.js`, which build a cli graph anyway |

**They are loaded always, not on request.** That is what lets a running app be
asked for any one of them without being restarted. There is no `--selftest` or
`?selftest` gate on loading -- only the production check, which webpack uses to
drop the whole `require.context`.

**A plugin is named after where it lives.** Every setup function in this app is
called `plugin`, so rectify -- which names a plugin after its setup function --
fell back to "the plugin providing [io]" and "the plugin at config index 7
consuming [...]" for all of them, in `app.plugins`, on the Graph page and in the
message naming a plugin that could not be resolved. All five boots now stamp the
folder path through `src/target.js`, so a plugin is called `core/io/server.js`
everywhere. `test/server-graph.test.js` and `src/app/demo/window.test.js` fail if
a boot stops doing it.

Targeting happens **when the run is asked for**, not when the app starts: `src/target.js`
tags each suite with the plugin that registered it, and `run({ only })` filters on that. A
flag at load time would mean restarting the app to change target, and not restarting is the
whole point.

`src/app/core/selftest/main.js` is the collector: one ipc command that runs the main harness
here, calls the node half's through `ipc.invoke`, asks the window over the socket, and hands
back all three. The cli context is not part of the running app, so the driver runs that one
itself.

**Every plugin has a test beside it except `core/selftest` itself**, which is the runner --
testing it with itself proves nothing that its passing does not already prove. When adding a
plugin, add its `<context>.test.js` too; the audit is one command:

```sh
for c in main server window cli; do
  for f in $(find src/app -name "$c.js" -not -path "*/core/selftest/*"); do
    [ -f "$(dirname $f)/$c.test.js" ] || echo "$f has no tests"
  done
done
```

**A packaged build cannot load its own tests.** Each `require.context` sits inside the check,
so webpack drops it, and `main.prod.js` has no equivalent path. `npm run drive -- --build
--selftest` says so rather than reporting three empty contexts as failures.

**There is no mock host any more.** The server half used to be booted in the test process
against a stand-in for nw, and that hid things: its `quit` was a no-op, so a test that called
`quit` passed and proved nothing -- against the real app it shut the whole thing down
mid-suite. Its `fakeSocket` meant the io handshake test checked that a listener was attached
rather than that anything could reach it; that test now opens a real socket.io client to the
app's own port.

**Measure what is read, not what contains it.** The sidebar test passed happily while every
link in it was the colour of the ground, because it measured `.app-sidebar` rather than the
links inside it. Sabotage the thing before trusting the test that watches it.

