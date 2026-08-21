# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm start        # nw, development: main off disk, server and window bundled and reloaded
npm run cli      # a terminal talking to a running app
npm run build    # webpack, production bundles
npm run dist     # build, then package
npm test         # node --test
npm run drive    # start the app, drive it, check what only the real app can answer
```

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

## Where a plugin goes

```
src/app/
  core/<name>/     the plumbing: how the app talks to itself and the outside
  ui/<name>/       what is on screen
  demo/            the example app, deletable in one go
  remote/          a feature, beside the groups rather than inside them
```

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

`npm run drive -- --selftest` starts the app, tells it to load its own test plugins, runs them
where they are, and reports each one. `npm test` does the same through `test/selftest.test.js`,
and both go through `tools/selftest.js` -- the walk, the cli graph, the launcher and the wait
are written once, or the day one is fixed the other keeps the old behaviour.

| context | where its suites run | loaded when |
|---|---|---|
| `main` | nw's node side | `src/main.js` sees `--selftest` |
| `server` | the node half | `src/server.js` reads `host.selftest` |
| `window` | the page | `src/window.js` sees `?selftest`, put there by `core/window/main.js` |
| `cli` | the drive process | `tools/drive.js`, which builds a cli graph anyway |

`src/app/core/selftest/main.js` is the collector: one ipc command that runs the main harness
here, calls the node half's through `ipc.invoke`, asks the window over the socket, and hands
back all three. The cli context is not part of the running app, so the driver runs that one
itself.

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

