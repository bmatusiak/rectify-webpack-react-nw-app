# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm start        # nw, development: main off disk, server and window bundled and reloaded
npm run cli      # a terminal talking to a running app
npm run build    # webpack, production bundles
npm run dist     # build, then package
npm test         # node --test
```

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

`npm test` runs `node --test` over `test/`. Two of them are load-bearing beyond their own
subject:

- `server-graph.test.js` builds the real server entry with webpack and boots it against
  express and socket.io. It is the only place the bundled node half is exercised outside
  nw, so a broken `require.context` regex or an unresolvable server graph fails here.
- `plugin-scan.test.js` keeps the five discovery sites in agreement, and checks that both
  one-level and two-level plugins are found and that `_`-prefixed folders are skipped.

The window half needs a DOM and is covered by running the app, not from here.
