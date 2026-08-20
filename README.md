# rectify-webpack-react-nw-app

Minimal scaffold: a [rectify](https://github.com/bmatusiak/rectify) plugin app,
bundled by webpack, rendered with React, running live inside an nw.js window.

`webpack-rectify-react` (plugin architecture + theme kit) merged with
`react-nw-app` (nw.js shell). There is no build/packaging step — nw.js runs
everything, and the code it runs is the code in `src/`.

## three boots, one folder of plugins

A plugin is a folder in `src/app/`, and the files inside say where it runs:

```
src/
  main.js       boot: nw's node context. loaded off disk, never bundled
  server.js     boot: the app's node half. bundled, reloaded on every save
  window.js     boot: the browser. bundled, hot reloaded
  cli.js        boot: plain node. a terminal talking to a running app
  config.js     settings, sliced per plugin
  index.html
  overlay.js
  app/
    lifecycle/  main.js                              shutdown, crashes, instance file
    http/       main.js                              express, the swappable router
    io/         main.js server.js window.js          socket.io, all three sides
                serve.js mock.js                     shared between two of them
    ipc/        main.js server.js cli.js             the control socket
                endpoint.js                          where it lives, both sides
    cli/        cli.js                               the command table
    window/     main.js server.js                    the nw window, and its handle
    tray/       main.js server.js                    the tray, and its menu api
    devtools/   main.js                              the two Inspect items
    build/      main.js                              webpack and the reload
    react/      window.js                            createRoot
    storage/    window.js                            session + config stores
    theme/      window.js + components/ + scss       the theme kit
    demo/       window.js server.js cli.js          delete this one
                pages/                               one file per page
```

Each boot gathers its own half and nothing else:

```js
//src/window.js
var found = require.context('./app', true, /^\.\/[^_.][^/]*\/window\.jsx?$/);
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

They are three separate rectify apps with three service graphs, so a plugin
that spans runtimes joins itself:

- `window/main.js` owns the real nw window and provides `window` on the main
  graph. `window/server.js` provides `window` on the app graph, wrapping a
  controller handed over from main. Same name, same meaning, different process.
- `tray/` does the same for the tray.
- `io/main.js` creates the socket.io server, `io/server.js` registers the
  handlers, `io/window.js` connects — and both of the latter share `serve.js`,
  which is the one function `?mock` runs in the page.

Main hands the app side a **host** object — `express`, `router`, `httpServer`,
`io`, `appPackage`, and controllers for `window` and `tray` — and it arrives as
`app.host`. Under one key on purpose: rectify's own `services.app` already
carries `window` (the dom window, or `global` in node), `services`, `on`,
`emit` and the `is*` flags, so anything spread in there is one name away from a
collision that looks like it works.

The startup order lives in `src/main.js` rather than inside whichever plugin
happens to depend on all the others:

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

`npm run build` produces four files and no javascript:

```
build/app/
  package.json   main: app.html, window hidden
  app.html       one line: evalNWBin(null, 'main.bin')
  main.bin       native code, compiled by nwjc
  icon.png
```

What goes into `main.bin`: `src/main.prod.js`, every `main.js` plugin half,
`src/server.js` and every `server.js` half, express, socket.io — and the window
half as a string, so it is served out of memory and never written to disk
either. Nothing is external, because there is no `node_modules` beside it.

### why it boots differently

`evalNWBin` is a `Window` method, and nw's node context has no window —
`nw.Window.get()` throws `No current window` there. So the packaged app's
`main` is a hidden local page whose only job is to load the binary. Local means
it has node; being a window means `evalNWBin` exists at all. The visible window
is still remote and still has no node.

That is the whole reason for the second boot: `src/main.js` reads plugins off
disk for development, `src/main.prod.js` gets the same list from the bundle
through `require.context`, and both hand off to `src/boot.js`.

`src/app/build` is where the two modes actually diverge — webpack, watching and
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

### the examples it is built from

`bootstrap-5.3.8-examples` is the source, and the page-shaped ones are
components in `src/app/theme/components/examples.js` rather than markup to
copy. Each demo page is the example with the parts that were static made to
work:

| page | what the original does | what this one does |
|---|---|---|
| **Dashboard** | chart.js drawing seven numbers | an svg polyline drawing the memory of the process you are talking to, sampled over the socket, pausable |
| **Checkout** | a cart whose total is typed in | a cart that adds up, a promo code that is real (`DEMO10`), and a form the store remembers |
| **Blog** | posts of lorem, links that go nowhere | notes about this app, and the sidebar actually opens them |
| **Cover** | a whole window, three dead links | the same page in a box, and the three links switch it |
| **Cheatsheet** | every component listed | the values underneath them, read off the live page, so it says what the swatch you are wearing resolved to |

The chart is deliberately not a dependency. It is a `polyline` in a `viewBox`,
which is all that example draws, and it takes its colour from the swatch like
everything else.

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
forwarded to the running app, so a plugin that answers over ipc is reachable
from the terminal without a `cli.js` at all — `open`, `hide` and `quit` are
registered by `src/app/window/server.js` and nothing declares them here.

### capture

```
npm run cli -- capture                              capture-20260820-142201.png
npm run cli -- capture '{"path":"shot.png"}'        where you say
npm run cli -- capture '{"format":"jpeg"}'          smaller, lossier
```

The window plugin is the one that spans all four runtimes, and this is why.
`nw.Window.capturePage` exists only where the window handle does, which is the
**main** context, so `main.js` takes the picture; `server.js` answers on the
socket and writes the file; `cli.js` exists only to resolve the path, because
the app's working directory is wherever it was launched from and yours is not.

The buffer stops at the file. It never goes down the socket — the wire is one
json line, and a megabyte of base64 on it would serve nobody when the thing
wants to be a file anyway. What comes back is the path, the size and the
dimensions, read out of the image's own header rather than from the window: a
screen at 2x returns a picture twice the size the window was asked to be.

**A hidden window has no frame.** The compositor draws nothing for it, so
`capturePage` never calls back at all — not an error, just silence. Hiding and
showing both go through this plugin, so it knows, and says so instead of
waiting. A minimized window looks the same from here and is not tracked; that
one falls to a 15s timeout.

### clicking

`capture` gave it eyes. These are the hands.

```
npm run cli -- click Save                press it
npm run cli -- click ".btn-primary"      by selector instead
npm run cli -- fill "#email" me@here     type into it
npm run cli -- fill select darkly        choose in it
npm run cli -- fill "#agree"             toggle it
npm run cli -- read .nav-link            what is there now
```

Naming something by its text is refused when the text is not unique. A screen
says the same word twice more often than you would think -- the demo has a
`light` button variant and a Light mode toggle -- and picking one silently is
how you click a thing you never named and believe you clicked the other.

Say which element three ways, tried in that order: a **css selector**, because
it is exact; the **visible text**, because "the button that says Save" is how
people think about a screen; or a **point**, `{"x":120,"y":80}`, which is the
only one of the three that respects what is on top. Text only matches things a
person could click or type into, and prefers one that is actually on screen --
a bootstrap app keeps whole pages in the dom with `display:none` on them.

It is **not an `eval` channel**. One would have been three lines and would have
answered every question this will ever be asked, and would also have handed
anything that can open a local socket the run of the app -- which is the exact
thing `nwjc` is there to prevent. So: verbs, and only these.

Two details that took measuring:

- `click` is not `element.click()`. That fires one event, and half of bootstrap
  listens for the ones around it -- dropdowns close on `pointerdown`, carousels
  drag on `mousedown`. It sends the sequence a mouse actually produces.
- `fill` does not assign `el.value`. React remembers the last value it wrote
  and drops any change event whose value it thinks it already knows, so
  assigning moves the input on screen and nothing else. Going through the
  prototype's own setter moves React's copy with it.

### which view gets it

`npm run cli -- views` lists them, because there can be more than one -- **open
in browser** makes a second, and it is a real client of the same server. The
app's own window wins; a browser view only gets the click if it is the only
thing there, and the answer says which one it went to.

Nothing in the page can tell the two apart on its own. Nw 0.114 sends an
**ordinary chrome user agent** with no mention of nw in it, and the window
deliberately has no node in it to ask. So the side that opened it says so:
`src/app/window/main.js` opens the url with `?view=app` and the remote plugin
reads it back.

### nothing is listening

A **packaged build opens no port at all**. No http server, no socket.io, no
webpack — `npm run build` leaves a directory with a manifest, two html files
with nothing executable in them, `main.bin`, an icon and the stylesheets.

The window is opened straight out of the package rather than over a url, and
its half of the app is evaluated into the page out of `main.bin`. So there is
still no javascript on disk, and now there is also nothing to serve it with.
What used to be socket.io is `src/app/bridge`: main injects a way home into the
page before any of the page's own script runs, and messages go the other way by
`postMessage`. One json object per line, the same shape the control socket uses.

The shim it hands the rest of the app is socket.io's shape, so **no plugin
knows which build it is in** — `io.on('connection')`, `socket.emit(name, data,
ack)`, all of it. `src/app/io/window.js` picks the transport by looking for
what main injected; `src/app/io/main.js` picks it from `BUILD_PROD`.

Two things go with it. The tray loses **Inspect window**, **Inspect main.js**
and **Open in browser** — the first two hand back exactly what compiling the
node half was for, and the third has no page to open. And `http` still exists
as a service, because the graph is the same in both builds; what it does is
nothing. A route mounted in a packaged build goes to a stub rather than
throwing, and `http.url` is `null`, which is the signal anything asking should
check.

### the control socket

It is a **named pipe** on windows and a **unix domain socket** elsewhere, not a
port. Both sides derive the address from the package name, so nothing has to be
discovered or written down, and the cli needs no dependency beyond `net`.

It is **not open to whoever finds it**. A named pipe on windows is reachable by
anyone logged into the machine, and `/tmp` on posix is world-readable, so being
hard to find is not the same as being hard to reach. The app writes a fresh
32-byte token beside the socket every run — in the per-user temp directory, and
`0600` on posix — and a connection that cannot repeat it gets one sentence and
nothing else. A client that connects and then says nothing is dropped after
five seconds.

The comparison is `timingSafeEqual` behind a length check, which it needs
because that function throws on a length mismatch rather than returning false.

One json object per line, both directions:

```
{"id":1,"command":"open","data":{}}
{"id":1,"ok":true,"result":"shown"}
```

The listener is in `ipc/main.js` rather than the reloadable half, for the same
reason the window and the tray are: a reload would drop every connected client
and then race to listen on an address still held. `ipc/server.js` hands app
plugins a `handle(name, fn)` that comes back off on reload — otherwise the
previous build keeps answering.

```js
//src/app/my-thing/server.js
var answered = ipc && ipc.handle('my-thing', async function (data) {
    return { ok: true };
});

await register(null, { onDestroy: function () { if (answered) answered.remove(); } });
```

On posix a hard kill leaves the socket file behind, so the listener unlinks a
stale one before binding.

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
npm start        # nw.js: node context + window, then gives the terminal back
npm run cli      # talk to a running app over its control socket
npm run build    # production bundles, compiled and staged into build/app
npm run dist     # build, then nw-builder -> build/out
npm test         # node --test
```

`npm start` also takes `--build` and `--package` to run what those two produced
— see [building a package](#building-a-package).

The app runs under nw.js and only under nw.js. There is no plain-node mode, and
dropping it took about a dozen "might not have a window" branches out of the
plugins: the host always carries a window, a tray and a control socket, so
nothing has to ask.

`npm start` returns straight away and the app keeps running. Run it again and
it says so, and brings the window back:

```
$ npm start
launching node_modules\nw\nwjs-sdk-v0.114.2-win-x64\nw.exe
logging to nw.log  (--attach to watch it live)

$ npm start
already running (pid 35788) at http://localhost:57539/
bringing its window to the front
```

nw.js is single instance, so the second launch is handed to the running app,
which shows its window. That handoff happens inside the nw binary though, so
the launcher cannot see it — `main.js` writes `.nw-instance.json` with its pid
and url, and `tools/nw.js` reads that. A stale file left by a hard kill is
caught by signalling the pid.

Detached means the output goes to `nw.log` instead of your terminal.
`npm start -- --attach` keeps it in the foreground when you want to watch a run
happen, and combines with `--build` and `--package`. Other flags pass through
either way:

```
npm start -- --remote-debugging-port=9222
```

The port is whatever is free, so two of these can run side by side. `PORT=8080`
pins it.

`tools/nw.js` passes `--enable-logging=stderr`, which is what makes the
window's console audible at all — without it a page that threw on load looks
exactly like a page with nothing to draw.

### inspecting either half

Devtools does not open by itself. The tray menu has both:

- **Inspect window** — the page. `win.showDevTools()`, the ordinary thing.
- **Inspect main.js** — the node context. Not the ordinary thing: `main.js`
  runs in `_generated_background_page.html`, which nw does not treat as a
  window, so `nw.Window.get()` throws `No current window` there with or without
  a window object passed to it. The way in is chromium's own debugger. The
  launcher starts nw with `--remote-debugging-port=0`, chromium picks a free
  port and writes it to `DevToolsActivePort` in the user data dir, and the
  `background_page` entry in `/json` carries a frontend url to open.

  (`nw.App.dataPath` is `<user data>/Default`; the port file is one level up.)

The port is loopback-only and never pinned. Pass your own
`--remote-debugging-port` to override it.

### reloading

Both halves hot reload. The window half goes through webpack-hot-middleware;
the node half is watched too, and on each rebuild `build/main.js` tears the old
one down and loads the new bundle in place — same process, no restart.

That teardown is why a `server.js` has to clean up after itself. Return an
`onDestroy` alongside what you provide — the same shape as an effect returning
its cleanup:

```js
//src/app/my-thing/server.js
async function plugin(imports, register) {
    imports.app.host.router.get('/api/thing', ...);   //router is swapped for you

    await register(null, {
        'my-thing': ...,
        onDestroy: function () {                      //anything else, undo it here
            imports.app.host.io.removeAllListeners('connection');
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

Closing the window does not quit. The node half keeps running behind the tray
icon; reopen from the tray, by left-clicking it, or by running `npm start`
again, and quit from the tray's Quit.

Two mechanisms hold that up, because one of them is not reliable:

- `close` is intercepted and the window hidden instead, so reopening is instant
  with the page state intact. Nice when it works — but **a page reload silently
  drops that listener** while leaving `loaded` firing, and the window half
  full-reloads on any change it cannot hot swap. So the first edit you make
  turns close back into a real close. Re-attaching on `loaded` does not fix it;
  the handle is stale.
- So `window` also opens a hidden, never-closed keep-alive window. nw quits when
  the *last* window closes, and that one never does. If the interception held,
  the window hides; if it did not, the window is destroyed and the app survives
  anyway — "Open window" then makes a fresh one.

Measured both ways: fresh start, close hides it. After an edit, close destroys
it and the app is still serving.

Quitting has to be thorough. `nw.App.quit()` alone does not always manage it —
the http server, socket.io and webpack's watchers are open handles, and the
node context can outlive the window holding them, which leaves a copy running
with nothing on screen and the port taken. So `shutdown()` closes the server,
removes the tray, closes the windows, quits, and then hard exits.

Closing the devtools window does nothing to the app.

### the tray belongs to the app too

`src/app/tray/server.js` provides a `tray` service, so a plugin can put its own
items on the menu:

```js
//src/app/my-thing/server.js
plugin.consumes = ['tray'];

async function plugin(imports, register) {
    var item = imports.tray && imports.tray.add({
        label: 'Say hello in the log',
        click: function () { console.log('hello'); }
    });

    //nw.MenuItem options all work: type, checked, enabled, submenu, icon, key

    await register(null, { onDestroy: function () { if (item) item.remove(); } });
}
```

Give the item back on teardown and a reload cannot leave a second copy behind —
the menu is rebuilt from scratch each time rather than patched by index. The
`window` service alongside it carries `url`, `isOpen`, `open()`, `show()`,
`hide()`, `openInBrowser()` and `quit()`.

The icon and the window themselves live in `tray/main.js` and `window/main.js`,
not in the halves that reload: they have to outlive the bundle that is being
thrown away. The `server.js` halves wrap a controller and own only what they
added.

Both are always there, so a `server.js` can use them without asking.

Two things you will see if a copy is somehow still up:

```
Opening in existing browser session.        # nw.js is single instance. the
                                            # second start woke the first one
                                            # and exited. the window comes back.

port 8080 is already taken. another copy    # only if you pinned PORT.
is probably still running.                  # this one shuts down instead of
                                            # sitting there dead.
```

## adding a plugin

Make a folder under `src/app/` and put in the halves you need. Nothing to
register:

```
src/app/my-thing/
  server.js     runs in the node half
  window.js     runs in the window
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

### the demo

`src/app/demo` is an app built out of the kit: a sidebar, seven pages, and a
toast stack. It is meant to be poked at rather than read — most of what is on
screen does something real:

- **System** — pid, uptime, memory and round-trip time, live off the socket.
  The buttons hide the window, open it in your browser, and add and remove
  items on the actual tray menu.
- **Forms** — a validated form whose values go into the `config` store, so they
  survive a restart. The panel beside it shows what is stored.
- **Data** — the service graph of both halves, searchable, sortable, paged.
- **Overlays** — modals that return a value, an offcanvas from any of the four
  edges, toasts, tooltips, popovers, dropdowns that change the page.
- **Disclosure** — tabs, accordions, collapse and a carousel that runs itself.
- **Layouts** — hero, features, stats, pricing and album, from bootstrap's own
  examples. The pricing choice is remembered.

Delete the folder and the app is the scaffold again.

### the theme kit

`theme` is a slot, and bringing your own style is the expected thing to do.
Bootstrap, jquery and bootstrap-icons are in `src/app/theme/` because something
had to be — tailwind, plain css, a component library or nothing at all all fit
the same slot.

The service name is the only thing anything outside that directory knows: a
plugin asks for `theme` and reads `theme.ui`. So a swap is the whole directory
replaced. What this kit carries:

```
theme.ui            every component
theme.themeSwitcher flips light/dark, remembered in the config store
theme.mode          which one is on
theme.swatches      the stylesheets in ./swatch, by name
theme.swatch        which one is worn
theme.setSwatch     wear a different one, now
theme.bs            bootstrap's own javascript
theme.$             jquery, this kit's dom helper
```

### what a swatch is allowed to change

Everything the shell paints is mixed from `--bs-body-bg` and `--bs-body-color`,
the two custom properties every swatch sets, rather than from bootstrap's
`bg-body-tertiary`. That utility looks like the right answer and is not: the
bootswatch **dark** themes redefine it only under `[data-bs-theme=dark]`, so
picking one in light mode left the sidebar the light grey it is at `:root`
while the text followed the swatch, and the navigation disappeared.

The mode toggle and the swatch could contradict each other too, and the
stylesheet wins: once a swatch has loaded, the body's real background decides
what `data-bs-theme` says. Ask a dark design for light mode and the toggle
disables itself and says why, rather than offering a choice it cannot honour.

Three things a swatch styles for a page it expected, not the one it got:
**headings** point at `--bs-heading-color`, which a swatch may pin once and
never mention again -- `lux` sets `#1a1a1a` at `:root` and says nothing about
dark, so its headings came out `#1a1a1a` on `#1a1a1a`, a contrast ratio of
exactly **1**. **Muted text** reads `--bs-secondary-color`, and some set it
pale enough to fall under the 4.5 floor. And a **navbar** carries its own
palette written for a coloured bar, which drew `darkly`'s brand at **1.1**
against the surface behind it. All three are mixed from `--bs-emphasis-color`
instead, the one bootstrap guarantees stands against the background either way.

Measured rather than eyeballed: `npm run cli -- read <selector>` reports the
computed colour, what is actually behind it, and the WCAG ratio. Sweeping all
28 swatches in both modes is how the three above were found and how they are
known to be fixed -- the lowest heading now sits at 14.2 and the lowest muted
text at 5.7.

Two components pay for this directly. A **readout** is not a button -- the
`35%` between the stepper's two buttons was a disabled one, so it took each
swatch's disabled colour, and on `lux` that is white on white. And
**`outline-light`** is invisible on every light theme, as `outline-dark` is on
every dark one; each gets a strip of contrasting ground, the way bootstrap's
own examples do it.

### swatches

`src/app/theme/swatch/<name>/` is a [bootswatch](https://bootswatch.com) build,
and the folder is the registry again: drop one in and it appears in the picker,
delete one and it does not. `default` is vanilla bootstrap.

Which means **bootstrap is not compiled into `index.scss`** — it arrives as a
stylesheet link that `setSwatch` swaps. If it were compiled in, style-loader
would inject it after that link and every swatch would lose to it. So the
kit's own rules use bootstrap's custom properties rather than `@extend`, and
they stay on top of whichever swatch is worn because style-loader injects them
last.

Two things worth knowing before shipping 27 of them:

- They are **~230kb each**, and they are all in the package. Inside `main.bin`
  they took it from 4mb to 17mb, so `tools/build.js` leaves stylesheets out of
  the binary and ships them as files beside it — they are not code. Deleting
  the folders you will not use is how to get the rest back.
- **20 of the 27 pull their fonts from Google Fonts** with an `@import`. A
  desktop app that is offline will fall back to a system face, so the colours
  arrive and the typography does not. Self-hosting the fonts, or picking from
  the seven that do not, is the fix.

`theme.ui` covers what bootstrap's examples do — `Alert Badge Button
ButtonGroup Card ListGroup Table Spinner Progress Placeholder Icon`, the form
controls `Form Input Textarea Select Check Range InputGroup`, navigation
`Navbar Tabs Breadcrumb Pagination Sidebar`, the javascript-backed `Modal
Offcanvas Toasts Tip Dropdown Accordion Collapse Carousel`, and the page shapes
`Page Section Hero Footer Features Pricing Album Stats`.

The split is deliberate: anything bootstrap drives from a data attribute is
left as markup, and only the parts that need one of its instances — modal,
offcanvas, tooltip, popover, carousel — create and dispose one.

None of those names are required of a replacement, only of the demo that uses
them.

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

All three boots listen for rectify's `error`. Without that the emit throws with
no indication of which plugin died. `src/main.js` and `src/server.js` log it —
and the server boot rethrows, so a broken node half fails the reload loudly
instead of half-starting. `src/window.js` also prints it at the top of the page
rather than leaving you a blank one.

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
