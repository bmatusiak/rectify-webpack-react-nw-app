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
npm run docs     # read the plugin READMEs back off the code -- deliberately not in npm test
npm run monitor test    # any of the above, as one line per event, ending with ✔ or ✖
node tools/mcp.js       # an MCP server for the running app, on stdin and stdout

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
Development always has the ability. `src/serve.js` answers `false` or `{host, port}`. The tray
switches it while the app is running, with a plain item whose LABEL says what clicking will do
-- nw draws no checkmark for a `type: 'checkbox'` item on windows, so a checkbox there shows
state to nobody.

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

**Three files are outside that loop**, because they are read once when the app
starts: `src/main.js`, `webpack.config.js` and `package.json`. Editing the
config and carrying on gives the WRONG error -- `core/build` rebuilds with the
config it loaded at boot, so a constant added to DefinePlugin in the same commit
that first uses it comes back as `BUILD_ROOTS is not defined`, thrown while the
server half loads, which reads as a broken bundle rather than a stale config.
Restart after touching any of the three.

`npm run drive` takes the same `--build` / `--package` as `npm start`, plus `--shots` to
keep a screenshot of every page and `--swatches` to check all twenty-eight rather than
three. It leaves the app running if it already was, and shuts it down if it started it.

## How long things take, and how to wait for them

Measured on this machine, warm, with the app already running:

| command | takes | the line that says it is over |
|---|---|---|
| `npm run docs` | under 1s | `nothing to say`, or `N findings` |
| `npm run drive` | 9s | `N checks passed`, or `N failed, M passed` |
| `npm test` | 15s | `ℹ fail 0` |
| `npm run drive -- --shots` | 14s | as `drive` |
| `npm run drive -- --swatches` | ~4m | as `drive` |
| `npm run dist` | ~3m | `packaged into build/out` |
| `npm run drive -- --package` | ~1m | `shutting it down again` then the count |

**Run the first four in the foreground.** They finish before a poll loop could
ask twice, and a foreground call returns the output in one step.

**Wait on an event, never on a timer.** For the long three, start the command in
the background and then *stop*: the completion notification is the event. Reading
the output file on a loop to see whether it has finished yet is five round trips
where one would do, and it is the same mistake as sleeping instead of polling --
one layer up.

**`node tools/monitor.js <command>` is that, as a stream.** One line per thing
that happened, `x` for anything wrong, and a last line that is always `✔` or
`✖` -- so nothing watching has to know which words a particular tool ends with.
It reports its own silence as well, because a command that hangs prints nothing
and nothing is indistinguishable from working. `--quiet=N` and `--give-up=N`
before the command name, the command's own arguments after `--`.

When progress matters rather than just the end -- a package build, a swatch
sweep -- watch the stream and let each interesting line be its own event, using
the marker lines above plus whatever says it went wrong (`✖`, `x `, `Error`).
A watcher that only matches success is silent through a crash, and silence
reads exactly like still-running.

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

## Who, what, how, why

Four questions, and each one has exactly one place to be answered. A reader
opening a plugin should be able to walk them in order, the way a book is read.

| | where | answers |
|---|---|---|
| **WHO** | the folder, and the context filename | which plugin this is, and which of the four runtimes it is speaking in. `ui/banner/window.js` is the whole answer, and it is the name the app itself uses -- `src/target.js` stamps it, so it is what `app.plugins`, the Graph page and a resolution failure all say |
| **WHAT** | `README.md` | what it is, what it provides and consumes, what it guarantees, and what it deliberately does not do |
| **HOW** | the `.js` | the code. Nothing else |
| **WHY** | comments in the `.js` | why the code is written THIS way and not the obvious other way: the alternative, and what it cost |

**WHY is split by scope, not by file.** The README carries the WHY a reader needs
*before* opening the file -- the decisions, the design, the reason to use this
plugin rather than something else. A comment carries the WHY that only means
anything standing on that line. The test is: **would somebody need this to decide
whether to open the file, or only to understand the line in front of them?**

```
README   "Markdown carries raw HTML through by design, so it renders into a
          frame that can do nothing."               <- decide whether to use it
comment  "document-start does not fire again on a reload, so main puts __host
          back on `loaded` too."                    <- understand this line
```

Say it in one place. `core/appPackage` told the same story -- "it used to be
registered by io, so wanting the app's title meant consuming a socket" -- in
`window.js`, in `server.js` and in its README. Three tellings drift into two
truths and a lie, and the two in the source were the ones nobody was reading.

**A comment that restates the code is HOW written twice.** Delete it. `//set the
title` above a line that sets the title is noise that has to be maintained.

**A WHY names the road not taken.** Not *what this does* and not *why this
exists* -- why it is written this way rather than the way somebody would
reasonably write it instead. The comment has to carry the alternative and what
it cost: *"an empty `sandbox` attribute renders nothing in this nw build, measured five ways"*,
*"a fixed number of frames is not a result -- two was enough on an idle machine
and not enough with the suite running"*, *"a capture that is NOT skipped takes
fifteen seconds, and sixty of those is a suite that never ends"*.

**The test:** would the comment still be true if the code were rewritten the
other way? Then it is not a WHY. *"Delivery is a microtask"* describes the line
and dies with it; *"a synchronous delivery arrives before io/window.js is
listening, and the wire drops it for want of a handler"* explains why the line
cannot be the other thing.

That is also what makes a WHY worth keeping. A rejected alternative is the one
piece of information the code cannot recover on its own -- the next person will
have exactly that idea, and the comment is what stops them spending the afternoon
that was already spent.

**Section headers are allowed, and are not WHAT.** `//---- browser views ----`
is a signpost for the eye, not a description of the code.

**A file that is not a context file may keep one line of WHAT.**
`demo/pages/*.js`, `ui/theme/components/*.js` and the helpers beside a plugin
(`io/serve.js`, `bridge/wire.js`) have no README of their own -- the plugin's
covers the plugin, not each file in it. One orienting line at the top is where
their WHAT lives; everything after it is still WHY.

**What this does not change:** the exports block at the top of a README, the
tables, and the `provides`/`consumes` lines are WHAT and stay there;
`test/readme.test.js` reads them back off the source. Prose is not checked, so
when behaviour changes, the paragraph about it changes in the same commit.

## Where a plugin goes

```
src/app/
  core/<name>/     the plumbing: how the app talks to itself and the outside
  ui/<name>/       what is on screen
  demo/            the example app, deletable in one go
  remote/          a feature, beside the groups rather than inside them

src/app_plugins/   a SECOND TREE, and deleting it is a decision about nothing else
  mcp/             an MCP server over the control socket the app already has
  mcp-example/     one of every MCP surface, registered against the real app
```

**The trees are named in package.json, and nowhere else:**

```json
"app": { "srcDirs": ["src/app", "src/app_plugins"] }
```

`src/roots.js` reads that list and validates it; both disk walks, all three
`require.context` calls, the readme audit, the targeting in `npm test -- mcp`
and `tools/docs.js` ask it. **Adding a tree is adding a folder and one line in
the manifest** -- `src/pr121/core/thing/server.js` loads exactly as
`src/app/core/thing/server.js` does. Measured: a third tree, listed and nothing
else, answered its own ipc command on the next start.

It was a literal array in `src/roots.js`, which was also one line -- but a line
of the app's SOURCE, so an app adding its own tree had a merge conflict waiting
in it every time the scaffold moved. package.json is the file an app already
owns, and already edits for `name`, `title`, `serve` and `canServe`.

A srcDir that the discovery rules could never match is **refused, naming the
key**: it has to be one folder inside `src/` (webpack's `require.context` is
rooted there and reaches down, never up), and it cannot start with `_`.

A plugin is named after **its own root**: `core/io/server.js` and
`mcp/server.js`, never `app_plugins/mcp/server.js`.

**A group is inside the app; a tree is separable.** `core`, `ui` and `demo` are
folders in this app and deleting one is a decision about this app.
`src/app_plugins` can be a checkout, a submodule, somebody else's package, or
gone -- nothing in `src/app` consumes anything in it. That is the test of
whether the plugin idea holds: a feature the scaffold OFFERS should be removable
without touching the scaffold, and a feature it DEPENDS on belongs in `core`.

**Unlisting a tree turns it off; underscoring it makes it not a tree.**
`require.context` takes a literal directory, so a list cannot be iterated into
it -- there is ONE context over `src/` and the trees are a filter
(`src/gather.js`). A folder in `src/` that is not listed is therefore still
compiled into the bundle and simply never registered; `_pr121` is not compiled
at all. Both measured, both ways.

A listed tree that is not on disk is fine now, in every context -- the disk
walks skip it and the one context over `src/` never matches it. It used to fail
the build outright, which is why `src/app_plugins` was committed with a README
in it even when it held nothing else.

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

`npm test` is the whole chain, and there are three kinds of suite in it:

| where | what it is about | runs in |
|---|---|---|
| `test/*.test.js` | **the app itself** -- the shape of the tree, the build, the boots | the test runner |
| `<plugin>/node.test.js` | **that plugin**, answered without an app | the test runner |
| `<plugin>/<context>.test.js` | **that plugin**, inside the running app | the app |

`test/selftest.test.js` is what starts the app and asks it for the third kind.
`.github/workflows/test.yml` runs the lot on every push.

**`test/` is about the app; a plugin's tests are in its folder.** Both of the
first two kinds are plain node files run the same way -- the difference is
subject, not runner. Six of them used to be in `test/` under names that said
what they were about rather than whose they were: `fanout.test.js` and
`mock.test.js` were `core/io`'s, `capture.test.js` was `core/window`'s. That
also broke aiming, invisibly -- a file in `test/` was matched before a plugin
and the search stopped, so **`npm test -- mcp` ran `test/mcp.test.js` INSTEAD of
the plugin's own two suites** and reported a green run about a third of what was
asked for. A target that names both now runs both.

**Which kind a new test is, is decided by what it needs.** If it can `require`
the module and ask it a question, it is `node.test.js` beside that module. If it
needs the real services, it is a `<context>.test.js` and it consumes them. If it
is about the tree, the build or the boots -- no single plugin owns it -- it goes
in `test/`.

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
  one-level and two-level plugins are found and that `_`-prefixed folders are skipped. It
  also holds `node.test.js` to being invisible to all five -- loaded as a plugin it would
  register nothing -- and checks `tools/test.js` can still find every one of them, since a
  runner that stopped looking would pass with fewer assertions and say nothing.
- `requires.test.js` resolves every relative require in `src/` and `tools/` that climbs
  out of its own folder. Moving a plugin one level changes what `../../..` means, and a
  main-side require is read off disk by nw at boot -- so nothing else here catches it.
  Regrouping under `core/` broke four of them and left the suite green.

`npm run drive` is the other half of it: start the real app and drive it over its own
control socket -- every page opened, and every heading, paragraph, piece of muted text,
inline `code` and alert measured for contrast, optionally in every swatch. It is the only check that can see the window, and
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

**A plugin may also carry `node.test.js`**, which is the other half of the same
idea: an ordinary node test file, in the plugin's folder, for the parts answered
without an app. `core/io/node.test.js` requires `./fanout.js` and `./mock.js`
and asks them questions; `core/bridge/node.test.js` wires two `wire.js`
instances to each other. It is not a plugin and no boot ever sees it -- `node`
is not one of the four contexts, so every regex and every walk misses it, which
`test/plugin-scan.test.js` checks on purpose.

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
plugin, add its `<context>.test.js` too. The audit is not a snippet to remember any more:
`test/plugin-scan.test.js` runs it, across every tree, and goes red for a context with no
test beside it.

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

