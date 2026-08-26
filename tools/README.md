# tools

Everything `npm` runs. None of it ships; all of it is plain node.

| file | script | what it does |
|---|---|---|
| `nw.js` | `npm start` | finds the nw binary and launches the app, waits until it is up |
| `profile-tests.js` | `npm run profile` | what each test file costs, one process each, and what never finishes |
| `check.js` | `npm run check` | does it compile: both bundles, plus every file no bundle contains |
| `stop.js` | `npm run stop` | ask it to quit, signal it if that cannot be reached, and wait until the pid is gone |
| `restart.js` | `npm run restart` | that, then `nw.js` again with whatever flags you passed |
| `running.js` | — | is the app up, and which pid -- shared by all three |
| `log.js` | `npm run log` | what the running app has been saying, minus chromium's noise |
| `test.js` | `npm test` | the whole chain, or one thing |
| `drive.js` | `npm run drive` | start the real app and check what only it can answer |
| `build.js` | `npm run build` | webpack, `nwjc`, staged into `build/app` |
| `pack.js` | `npm run dist` | wrap that into a runnable application |
| `selftest.js` | — | shared by `drive.js` and `test/selftest.test.js` |
| `sabotage.js` | `npm run sabotage` | break each plugin's own list of things on purpose, and say which checks noticed |

`DRIVE_LIST=1 npm run drive` names every check as it is made, rather than only
the ones that failed. A total that moves is a question -- 122 becoming 121 while
GAINING a page is not something a count alone can answer.

`selftest.js` is shared on purpose: the walk, the cli graph, the launcher and
the wait are written once, or the day one is fixed the other quietly keeps the
old behaviour.

## building a package

```
npm run build   production bundles, compiled, staged into build/app
npm run dist    build, then nw-builder -> build/out
```

`npm start` runs whichever of the three you ask for:

```
npm start              the source tree. webpack in memory, both halves reload
npm start -- --build   build/app: the compiled main.bin, run by the sdk runtime
npm start -- --package build/out: the executable, exactly what a user runs
```

Each runs strictly later output than the one above it, so something that works
in the first and not the third narrows to the step between them. `--build` still
has the sdk runtime under it, so its console is audible and devtools work;
`--package` is the normal flavour and has neither.

`npm run build` leaves a directory with no javascript in it at all:

```
build/app/
  package.json   main: app.html, window hidden
  app.html       one line: evalNWBin(null, 'main.bin')
  view.html      the visible window: a title and an empty <div id="root">
  main.bin       native code, compiled by nwjc
  theme/         the swatch stylesheets, as files
  icon.png
```

Neither html file has anything executable in it beyond that one `evalNWBin`
line, and neither fetches anything. The stylesheets are out of the binary on
purpose: inside it they took `main.bin` from 4mb to 17mb, and they are not code.

What goes into `main.bin`: `src/main.prod.js`, every `main.js` plugin half,
`src/server.js` and every `server.js` half, express, socket.io — and the window
half as a string, so it is served out of memory and never written to disk
either. Nothing is external, because there is no `node_modules` beside it.

### why it boots differently

`evalNWBin` is a `Window` method, and nw's node context has no window —
`nw.Window.get()` throws `No current window` there. So the packaged app's
`main` is a hidden local page whose only job is to load the binary. Local means
it has node; being a window means `evalNWBin` exists at all.

The visible window changes with the build. In development it is a **remote**
page — an http url with no `node-remote` against it, so it has no node. In a
package it is `view.html` out of the package itself.

**What does not change is how it talks to main.** The window is on
[bridge](../src/app/core/bridge/) either way, so its own traffic never goes over
a port. Http in development is there for webpack and hot reload, and for a
browser viewer if one was asked for.

That is the whole reason for the second boot: `src/main.js` reads plugins off
disk for development, `src/main.prod.js` gets the same list from the bundle
through `require.context`, and both hand off to `src/boot.js`.

[`src/app/core/build`](../src/app/core/build/) is where the two modes actually diverge — webpack, watching and
reloading on one side; assets served from memory and the node half simply
required on the other. `BUILD_PROD` gates the requires directly rather than
sitting inside a function, because webpack collects a dependency wherever it
can reach it, and a `require('webpack')` in an unreachable function would still
be bundled.

### paths inside a package

Nothing about the app's own location survives the move intact, so the two
places that need it are worth knowing:

- **`app.root` is `process.cwd()`** in the packaged boot. nw sets the working
  directory to the app's own directory, whichever directory it was launched
  from — measured both ways. The obvious alternatives all fail: `location.href`
  is a `chrome-extension://` url rather than `file://`, so `fileURLToPath`
  throws; `__dirname` does not exist in that context; `process.execPath` is the
  runtime; and `nw.App.startPath` is wherever the launch happened.
- **The tray icon goes in relative**, and nw resolves it against the app. The
  same value then works from the source tree and from inside a package.

Watch for that second one. An icon path that does not resolve is not an error —
`new nw.Tray()` succeeds, the menu works, and you get an invisible entry in the
notification area. It cost a while to notice, and longer to believe.

### builds from CI

`.github/workflows/prerelease.yml` builds all three platforms and attaches the
zips to a release, so a prerelease does not have to be built by hand. It runs
on `release: published` — which covers prereleases — and on
`workflow_dispatch`, where the zips land on the run itself instead.

The matrix is not a convenience. `nwjc` compiles for one platform and one nw.js
version, so each target has to be built on its own runner. Note `npm ci` must
run install scripts there: nw's postinstall is what fetches the sdk, and the
build needs `nwjc` out of it.

**Nothing is signed**, and no certificate is involved anywhere. What that costs
whoever downloads it:

- **Windows** — SmartScreen warns. More info, then Run anyway.
- **macOS** — the workflow ad-hoc signs (`codesign --sign -`, no identity
  needed) because Apple Silicon refuses to run an unsigned binary at all. It is
  still quarantined on download, so:
  `xattr -dr com.apple.quarantine "Rectify NW App.app"`, or right-click and Open.
- **Linux** — `chmod +x` the binary if the zip did not preserve it.

macOS also has no `.icns` here, so it packages without an icon rather than with
a fabricated one. Drop a real `.icns` in and pass it as `app.icon` in
`tools/pack.js` when there is one.

### what this does and does not protect

It means the app runs what it shipped with: there is no `.js` on disk to edit,
and no `node_modules` to shim. Swapping `main.bin` for another one is possible
but it is not a text edit.

It is not encryption. The window half is delivered to a browser context to run,
so it is readable there by anyone who opens devtools — as any client code is.
And `nwjc` output is tied to **one platform and one nw.js version**, so the
build has to run on each target with the runtime it will ship against. That is
why `tools/pack.js` takes its version from the same `nw` pin that compiled the
binary.


## driving the real app

`npm run drive` is the only check that can see the window. It starts the app,
opens every page over the control socket, and measures every heading, every
paragraph, every piece of muted text, every inline `code` and every alert against
WCAG's 4.5. Text that is not there is skipped: a `.placeholder-glow` paragraph is
a skeleton with no words in it.

**The per-page pass runs on whatever swatch the app is wearing**, so what it
reports moves with the last selection made in the window. `--swatches` is the
pass that does not depend on that.

```
npm run drive                whatever swatch is worn
npm run drive -- --swatches  all twenty-eight of them
npm run drive -- --shots     and keep a screenshot of every page
npm run drive -- --selftest  and run the in-app suites too
```

It takes the same `--build` / `--package` as `npm start`, and leaves the app
running if it already was -- **unless that app is not the one it was asked
for**. `--package` against a running dev app used to drive the source tree and
report `119 checks passed` without a word about the packaged build it never
touched. `hello` says whether the app is packaged, so the two are compared and a
disagreement is refused rather than driven. It earns its place: it found the active sidebar pill
unreadable on thirteen of the twenty-eight swatches, which nothing in `test/`
could have. What a swatch is allowed to change, and the three things they get
wrong, is in [theme](../src/app/ui/theme/).

**A skip is neither a pass nor a failure.** `--shots` against a minimized window
used to fail the page it could not photograph. The app says whether there was a
frame to take, so those are counted and listed separately, and the summary says
how many -- `119 checks passed, 2 skipped` rather than either a red run or a
green one that quietly photographed nothing.

**A number that moves is not a result.** Three things here need waiting for
rather than a fixed delay — a captured frame (the compositor), a crash report
(the log reaching disk), and a swatch (the stylesheet, then the mode following
it). Measuring a swatch after 900ms read text coloured for one mode against a
ground painted for the other and called a perfectly readable sidebar 1.5:1,
twelve times in a row.

**Measure what is read, not what contains it.** The sidebar test passed happily
while every link in it was the colour of the ground, because it measured
`.app-sidebar` rather than the links inside. Sabotage the thing before trusting
the test that watches it.

## an MCP server for this app

```
claude mcp add rectify-nw -- node /path/to/tools/mcp.js
```

`tools/mcp.js` is launched by an MCP client, speaks JSON-RPC on stdin and
stdout, and forwards what it is asked to the app that is **already running**,
over the control socket [ipc](../src/app/core/ipc/) already listens on. What the
app offers is [`src/app_plugins/mcp`](../src/app_plugins/mcp/); the protocol
itself is `rpc.js` in that folder, shared with the app's **other** transport —
`POST /mcp`, for a client that cannot launch a process. This file is a socket, a
line splitter, and stdout.

Prefer this one. The http transport is a listening surface and is behind three
gates because of it; this opens nothing.

| it speaks | |
|---|---|
| `initialize` | version negotiated: a version it knows is echoed back, one it does not gets the newest it has |
| `tools/list` `tools/call` | including `structuredContent` for a tool that declared an `outputSchema` |
| `resources/list` `resources/templates/list` `resources/read` | |
| `prompts/list` `prompts/get` | |
| `ping` | which answers without the app, because it is how a client checks this process is alive |

**Why a bridge rather than a server inside the app.** The app can serve http and
goes to some trouble not to: the port is off unless asked for, the tray stops it,
and `"canServe": false` removes the routes and socket.io from the binary at build
time. An MCP server listening inside the app would undo that for everyone who
never uses it. This opens nothing.

**And it is not a security boundary.** Anything that can run this can already run
`node src/cli.js quit`. What it is, is a described, schema'd, deliberately small
subset of the app aimed at a model instead of at a person — `quit` is not among
the tools, and `src/app_plugins/mcp/server.test.js` fails if it ever becomes one.

**The socket is not the permission.** The app writes a token beside it and
refuses commands from a connection that cannot repeat it, so this authenticates
exactly as the cli does. Without that step every call comes back *not
authenticated*, which is a confusing way to learn about a step you skipped.

**Nothing goes to stdout that is not a message.** A stray `console.log` lands in
the middle of the protocol and the client reports a parse error rather than
whatever was being said, so anything this file has to say goes to stderr — which
a client shows as server logs.

**With the app down it says so**, rather than hanging: `the app is not running --
start it with npm start`. A client that launched the bridge and got silence
would report an MCP problem to somebody who has an app problem.

[`src/app_plugins/mcp/node.test.js`](../src/app_plugins/mcp/node.test.js) speaks
the protocol to it over a pipe
— every list, a call, a read, a prompt, and the four ways of being wrong,
including a `resources/read` that tries to climb out of the tree.

## watching a command, one line per event

```
node tools/monitor.js test
node tools/monitor.js drive -- --swatches
node tools/monitor.js dist
```

It runs one of this repo's own commands and prints **one line per thing that
happened**, ending with a line that says it is over:

```
·  something happened, and it is going fine
x  something is wrong -- a failing test, a stack, an error line
✔  finished, and nothing was wrong          THE LAST LINE
✖  finished, and something was              THE LAST LINE
```

```
· test started
· ℹ pass 343
· ℹ fail 0
✔ done in 15s -- ℹ pass 343 -- ℹ fail 0
```

**Why not just `grep` the tool.** That is one line and it is what this replaces:
`node tools/test.js | grep -E "pass|fail"`. Two problems, and the second is the
one that matters. The filter has to be rewritten per command, because each tool
ends differently — `npm test` with `ℹ fail 0`, drive with `N checks passed`
unless it ends with `N failed`, pack with `packaged into build/out`. And a
filter written for the good case is **silent when the command dies**: nothing
matches a stack trace, so a watcher sees the last progress line and then
nothing, which is indistinguishable from still-running.

Here the last line is printed by a `finally`. A non-zero exit, a signal, a tool
that could not start at all — every one of them ends the stream with ✖ and a
reason, and the exit code is the command's own.

**`dist` is two commands and stops at the first failure**, because packaging a
build that did not happen makes a package of whatever was in `build/` from last
time — which is the kind of green that costs an afternoon.

**And saying nothing is an event too.** Everything above fires when a line
arrives, so a command that hangs produces no events at all — and silence reads
exactly like progress, which is the same trap one level up. The quiet is
reported instead, and it says which silence it is:

```
· quiet 30s -- 412 lines, none worth an event      webpack, mid-build
· quiet 60s -- nothing at all from tools/drive.js  waiting on something
x nothing for 600s, past --give-up=600 -- stopping tools/drive.js
```

`--quiet=N` is how long before the first of those (default 30s, `0` turns it
off), and each wait is twice the last up to five minutes — a heartbeat every
thirty seconds through a four-minute package is eight events that all say the
same thing. `--give-up=N` kills the command after that much silence (default
600s, `0` never). Both come **before** the command name; the command's own
arguments come after `--`.

**Two clocks, and they are not the same one.** `--give-up` counts silence from
the CHILD; the heartbeat spacing counts from the last thing this tool said. With
one clock each heartbeat reset the thing it was measuring, and `--give-up=12`
fired after twenty-two seconds. The deadline is also checked every second rather
than only when a heartbeat is due, for the same reason: a number somebody typed
should mean what it says.

**What it is not:** a test runner, a scheduler, or a log. `npm run log` is the
app's log; this watches a command that ends.

## reading the documentation back off the code

```
npm run docs
```

[`test/readme.test.js`](../test/readme.test.js) checks that every plugin **has**
a README and that its table lists the right contexts with the right
`provides`/`consumes` — read back off the plugin files, so the table cannot
drift. It cannot check a sentence, and a sentence is what goes stale: two places
said one fact, one of them was edited, and the other kept reading perfectly.

Six of those were found by hand in an afternoon — a protocol described as
packaged-only that every build now uses, a frame described as sandboxed that has
no sandbox attribute, a tray checkbox nw never drew. `tools/docs.js` is the five
checks that found them:

| | asks |
|---|---|
| 1 | every name a plugin **registers** appears somewhere in its README |
| 2 | every name the README's surface block advertises **exists in code** |
| 3 | every file and `--flag` named in backticks is something the repo has |
| 4 | a `\| test \|` table names tests that actually run |
| 5 | counted claims — *28 swatches* — against the count |

**It is deliberately not part of `npm test`.** Three of the five are heuristics,
and a heuristic that goes red on a Friday teaches people to ignore red. Run it
when the docs matter: after a sweep, before a release, when a README has been
sitting a while. It exits non-zero on a finding, so it can be wired into a suite
the day the heuristics have earned it.

**Every check was written by breaking the thing it watches**, and four of the
five were wrong the first time — which is the argument for doing that, not
against it:

- check 2 searched the source *text*, so an invented `window.capture().photograph()`
  went unreported: `photograph` is a word `window/main.js` uses in a comment. It
  reads code with the comments and string literals taken out now — and the third
  place the word survived was a comment in `index.scss`, which is why scss is
  stripped too.
- check 3 was then handed that same stripped copy and reported
  `_generated_background_page.html`, a page **nw** makes and this app only ever
  names in a comment. The two questions are different: *does this exist* is about
  code, *is this referred to* is about everything. There are two haystacks now.
- check 5 knew the literal words *28 swatches*, so editing a README to say *31*
  matched nothing at all. It reads whatever number the prose says and compares.
  It also used to count pages and contexts, and had to stop: this app writes
  sentences like *"inline code at 1.49:1 on four pages"*, and three false alarms
  out of four findings is how a check gets ignored.
- check 3 also reported `--bs-emphasis-color`, which is a css custom property
  rather than a flag anybody passes.

## reading the log

The app is launched detached with its output going to `nw.log`, so that file is
the only account of what it did. It is also mostly chromium describing its own
startup, and every line the app itself wrote is wrapped in quotes with a source
and a line number bolted on.

```
npm run log            what went wrong, most recent last
npm run log -- --all   everything, unwrapped
npm run log -- -f      and keep watching
npm run log -- 40      how many lines (default 25)
```

`tools/nw.js` requires `LOG_FILE`, `lines` and `unwrap` from here rather than
re-deriving them, so the launcher and the viewer cannot disagree about what the
log is.
