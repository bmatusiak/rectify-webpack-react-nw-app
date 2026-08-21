# demo

The example app. **Delete this folder and the app is the scaffold again.**

| file | provides | consumes |
|---|---|---|
| `window.js` | — | `app`, `react`, `theme`, `appPackage`, `io`, `settings`, `session` |
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

## the other two halves

`server.js` is where every System-page button lands, and it is a fair example of
a node half: it answers on the socket, registers ipc commands, puts items on the
tray, and gives all of it back in `onDestroy` so a reload does not stack a second
copy.

`cli.js` adds `npm run cli -- status` — is the app up, and where. It exits
non-zero when nothing is running, so a script can ask.

## the tests

`window.test.js` opens **every page in turn**, waiting for each to finish before
moving on, and fails on anything the console reported. That is what a parse error
in a page looks like from the outside, and it is what caught the checkout field
named `save` — see [storage](../core/storage/).
