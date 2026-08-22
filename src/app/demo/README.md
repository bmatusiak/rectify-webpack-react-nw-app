# demo

The example app. **Delete this folder and the app is the scaffold again.**

| file | provides | consumes |
|---|---|---|
| `window.js` | — | `app`, `react`, `theme`, `appPackage`, `io`, `settings`, `session`, `editor`, `markdown`, `xterm`, `litegraph`, `ext`, `banner` |
| `server.js` | — | `app`, `appPackage`, `tray`, `ipc`, `window` |
| `cli.js` | — | `cli`, `ipc` |

Provides nothing, in all three contexts. It exists to use what everything else
built.

It is meant to be **poked at rather than read**, and the rule it holds to is
that nothing on screen is a mock: the stores really remember, the socket really
answers, and the tray and window it moves are the app's own.

## the shell

A sidebar, a page and a toast stack, all built out of `theme.ui`. Which page you
were on is kept in `session`, so it survives a reload and not a restart.

`pages/index.js` is the sidebar, in order. **Adding a page is a line there and a
file beside it.**

## the pages

Seven are about the pieces:

| page | what it is |
|---|---|
| **System** | pid, uptime, memory and round-trip time, live off the socket. Its buttons hide the window, open it in your browser, and add and remove real tray items |
| **Buttons** | every variant, outline, size and state, each measured against what is behind it |
| **Forms** | a validated form whose values go into `settings`, so they survive a restart. The panel beside it shows what is stored |
| **Data** | the service graph of both halves, searchable, sortable, paged |
| **Overlays** | modals that return a value, an offcanvas from any of the four edges, toasts, tooltips, popovers, dropdowns that change the page |
| **Disclosure** | tabs, accordions, collapse, and a carousel that runs itself |
| **Layouts** | hero, features, stats, pricing and album. The pricing choice is remembered |

Five are whole pages out of `bootstrap-5.3.8-examples`, each rebuilt so that
**the part the example fakes is the part that works here**:

| page | the original | this one |
|---|---|---|
| **Dashboard** | chart.js drawing seven typed-in numbers | an svg polyline drawing the memory of the process you are talking to, sampled over the socket, pausable |
| **Checkout** | a cart whose total is typed in | a cart that adds up, a promo code that is real (`DEMO10`), and a form the store remembers |
| **Blog** | lorem posts, links that go nowhere | notes about this app, and the side column actually opens them |
| **Cover** | a whole window, three dead links | the same page in a box, since this app already owns the window, and the three links switch it |
| **Cheatsheet** | every component listed again | the values underneath them — colours, type scale, edges — read off the **live page**, so it says what the swatch you are wearing resolved to |

The chart is deliberately not a dependency. It is a `polyline` in a `viewBox`,
which is all that example draws, and it takes its colour from the swatch like
everything else.

The page shapes live in [theme's](../ui/theme/) `components/examples.js` rather
than as markup to copy.

Four more are about a vendored surface, one page each:

| page | plugin | what it shows |
|---|---|---|
| **Editor** | [ui/editor](../ui/editor/) | the three bundled ace modes, and the same four sentences highlighted as prose and as javascript, which is why the default is plain text |
| **Markdown** | [ui/markdown](../ui/markdown/) | a document containing a real `<script>`, a real `onerror` and a real remote image, none of which the frame lets run |
| **Terminal** | [ui/xterm](../ui/xterm/) | the same bytes through xterm and through a `<pre>`, side by side — plus the app's own `nw.log`, which is live |
| **Graph** | [ui/litegraph](../ui/litegraph/) | this app's own dependency graph, both halves of it, out of `app.plugins` and `ext.dependents()` |

**Those four services are consumed here rather than by the theme.** Each has a
page that shows what it is for, and the demo is the thing that shows what things
are for. Hanging them off the theme instead would make the theme — which the
root README calls a slot you are expected to replace — fail to load if you
deleted one of them.

The Terminal page's transcript is **canned, and says so**. Everything else in
this demo is live because a mock would prove nothing; there the bytes *are* the
subject, and a transcript that is the same every time is what makes the
comparison a comparison. The escape sequences in it are real, and so is what
xterm does with them. The log panel beside it is real machine output.

The Graph page is the one place this app uses **`ext`**, rectify's own registry,
provided by the same plugin that provides `Plugin`. Its `dependents(name)` reads
the graph rather than the registry, so it answers for plugins that never touched
`PluginBase` — which is most of them. Re-deriving *who would break* from
`provides`/`consumes` would be a second implementation of something the container
already knows. The node half is a different container and this one cannot ask it,
so that side is answered from the records it sent, and the panel says which of
the two answered.

## what it says across the top

Two states the demo already knew and was saying quietly or not at all, now raised
as [banners](../ui/banner/): a swatch that refuses the mode somebody asked for
(it was a disabled toggle with a tooltip), and a dropped socket (it was a
coloured dot in the footer). The second is the one that matters — a page whose
socket is dead looks exactly like a working one until you click something.

## the other two halves

`server.js` is where every System-page button lands, and it is a fair example of
a node half: it answers on the socket, registers ipc commands, puts items on the
tray, and gives all of it back in `onDestroy` so a reload does not stack a second
copy.

It also answers `demo:graph` with this half's `app.plugins`, and `demo:log` with
the tail of `nw.log` — raw, because a terminal wants the bytes as they were
written, and because requiring `tools/log.js` would drag `tools/` into the server
bundle when none of it ships.

`cli.js` adds `npm run cli -- status` — is the app up, and where. It exits
non-zero when nothing is running, so a script can ask.

## the tests

`window.test.js` opens **every page in turn**, waiting for each to finish before
moving on, and fails on anything the console reported. That is what a parse error
in a page looks like from the outside, and it is what caught the checkout field
named `save` — see [storage](../core/storage/).
