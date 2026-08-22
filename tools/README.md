# tools

Everything `npm` runs. None of it ships; all of it is plain node.

| file | script | what it does |
|---|---|---|
| `nw.js` | `npm start` | finds the nw binary and launches the app, waits until it is up |
| `log.js` | `npm run log` | what the running app has been saying, minus chromium's noise |
| `test.js` | `npm test` | the whole chain, or one thing |
| `drive.js` | `npm run drive` | start the real app and check what only it can answer |
| `build.js` | `npm run build` | webpack, `nwjc`, staged into `build/app` |
| `pack.js` | `npm run dist` | wrap that into a runnable application |
| `selftest.js` | — | shared by `drive.js` and `test/selftest.test.js` |

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
opens every page over the control socket, and measures every heading and every
piece of muted text against WCAG's 4.5.

```
npm run drive                whatever swatch is worn
npm run drive -- --swatches  all twenty-eight of them
npm run drive -- --shots     and keep a screenshot of every page
npm run drive -- --selftest  and run the in-app suites too
```

It takes the same `--build` / `--package` as `npm start`, and leaves the app
running if it already was. It earns its place: it found the active sidebar pill
unreadable on thirteen of the twenty-eight swatches, which nothing in `test/`
could have. What a swatch is allowed to change, and the three things they get
wrong, is in [theme](../src/app/ui/theme/).

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
