# remote

Click, fill and read the page — from the terminal, or from a test.

| file | provides | consumes |
|---|---|---|
| `window.js` | `remote` | `io`, `may` |
| `server.js` | — | `io`, `ipc`, `Plugin` |
| `cli.js` | — | `cli`, `ipc` |

```
npm run cli -- click Save                press it
npm run cli -- click ".btn-primary"      by selector instead
npm run cli -- fill "#email" me@here     type into it
npm run cli -- fill select darkly        choose in it
npm run cli -- fill "#agree"             toggle it
npm run cli -- read .nav-link            what is there now, and its contrast
npm run cli -- views                     which pages are open to be driven
npm run cli -- browser open              a second viewer, over socket.io
npm run cli -- read h4 '{"view":"browser-1"}'   ... and aim at it
```

## which view, by name

`views` lists what is connected by the name you can aim at:

```
window      Rectify NW App | Terminal
browser-1   Rectify NW App | System
```

**`window` is settled by the transport**, not by anything the page says: only the
app's own window is on [bridge](../core/bridge/), and the bridge calls its one
socket `window`. A browser cannot claim it.

**A session only answers *which*, never *what kind*.** [window](../core/window/)
stamps every browser view it opens with one, and the page echoes it back —
because socket.io's own id is opaque and changes under a client on every
reconnect, while the name main gave it does not. A browser somebody opened by
hand has no session, so it gets `browser-` and the first six characters of its
socket id.

Without a name to aim at, a browser view could be opened and looked at and never
driven: the app's own window always wins, which is the right default and a
useless one if it is the only rule.

`capture` gave it eyes; these are the hands. The window half is the only place
that can touch the document, so the clicking happens there and the rest is
plumbing to reach it.

It also **provides `remote`** in the window, because the three verbs are wanted
in the page as well as over the wire — a test cannot use the socket to reach
them, since emitting on it sends to the *server* rather than back to this window.

## a guarded control is opaque to it

`click`, `fill` and `read` all refuse an element carrying `.is-guarded` unless
[`may`](../core/may/) allows it — and a **single-match `read` carries the
element's `value`**, so this is the difference between the driver being able to
press a password field and being able to *empty* it.

**It used to be enforced in the component, and that was not enough.** The theme
asked `may` before running a guarded button's `onClick`, so a driven press raised
a question — but reading was never asked about at all. Measured on this app's own
demo: `read "#f-guarded"` handed back the password a person had unlocked the
field for and typed into, with no dialog and no record. The lock was on the one
field where *reading* is the risk.

Enforcing it here covers all three verbs at once, and covers a control the theme
did not draw — a plain `<button>` somebody gave the class to — which the
component version never could.

**`data-guard` names the capability**, because a guard that cannot be named
cannot be asked about; a mark with no name is refused rather than waved through.
A many-match `read` still names and measures guarded elements, since it carries
no values — that is what keeps `read ".is-guarded"` able to say how many there
are.

**It does not hold the caller while somebody decides.** A question stays up for
two minutes and the cli gives a command five seconds, so waiting for the answer
told the caller *"the view did not answer"* — which reads as a broken app rather
than a question on screen. It waits a moment, then says what is happening and
leaves the dialog up. `may` keeps one question per capability, so answering it
and asking again is the whole loop.

**It cannot stop something already inside the page**, which is the same limit
`may` states about a shell: it is the same javascript context, and the element is
right there. What this closes is the *socket* and the *service* being easier
routes than the one a person watches.

## it is not an eval channel

One would have been three lines and would have answered every question this
plugin will ever be asked. It would also have handed anything that can open a
local socket the run of the app, which is the exact thing `nwjc` is there to
prevent. So: **verbs, and only these.**

## saying which element

Three ways, tried in that order:

1. **a css selector** — because it is exact
2. **the visible text** — because "the button that says Save" is how people
   think about a screen
3. **a point**, `{"x":120,"y":80}` — the only one of the three that respects what
   is on top

Text only matches things a person could click or type into, so the word *System*
in a heading does not win over the *System* in the sidebar. And it prefers what
is actually on screen: a bootstrap app keeps whole pages in the dom with
`display:none` on them, and clicking one of those does nothing anybody can see.

**An ambiguous match is refused.** A screen says the same word twice more often
than you would think — the demo has a `light` button variant and a Light mode
toggle — and picking one silently is how you click a thing you never named and
believe you clicked the other. Matching more than one is an answer, and the
answer is *which ones*. `read` behaves the same way: asking about a class that
matches nine things says so rather than quietly answering about the first.

## two details that took measuring

- **`click` is not `element.click()`.** That fires one event, and half of
  bootstrap listens for the ones around it — dropdowns close on `pointerdown`,
  carousels drag on `mousedown`. It sends the sequence a mouse actually produces.
- **`fill` does not assign `el.value`.** React remembers the last value it wrote
  and drops any change event whose value it believes it already knows, so
  assigning moves the input on screen and nothing else. Going through the
  prototype's own setter moves react's copy with it. Checkboxes and radios are
  clicked rather than set, because that is the path react hears.

## which view gets it

There can be more than one — **Open in browser** makes a second, and it is a real
client of the same server. The app's own window wins; a browser view only gets
the click if it is the only thing there, and the answer says which one it went
to.

**The transport settles it when it can.** [bridge](../core/bridge/) calls its one
socket `window`, and only the nw window is ever on it — so arriving that way *is*
the proof. It cannot go stale and a browser cannot claim it.

Anything else is a socket.io client, where the page's own word is all there is;
a browser says no because it has no bridge to find.

That fallback is also what keeps this testable: `test/server-graph.test.js` boots
the real server half against real socket.io with **no bridge anywhere**, so a
harness there has no way to arrive as the window — and a rule that only the
bridge may answer would leave the one test that exercises this code outside nw
unable to say what it means.

**The page used to answer this alone**, first from a `?view=app` on its url and
later from whether `__host` had been injected into it. Both are the page
describing itself, and it got the answer wrong after a reload: the window came
back reporting *browser*, and a click then went to whichever view was left rather
than to the app.

## contrast

`read` returns a ratio with every element, because a screenshot shows you that a
heading is hard to read and this says **by how much** — the difference between an
opinion and a bug report. It is WCAG's: 4.5 is the floor for body text, 3 for
large text. `npm run drive` is this, over every page and every swatch.

Two things it has to get right, and got wrong first:

- **What the text is sitting on is every translucent layer between it and the
  first opaque one, painted in order.** Taking the nearest ancestor with any
  alpha at all was wrong and quietly so: a bootstrap card header is
  `rgba(222,226,230,0.03)` — three percent of a pale grey over a dark card — and
  treating *that* as the background measured white text at 1.3:1. Every panel
  heading in the app looked unreadable and none of them were.
- **`rgb()` counts to 255 and `color(srgb …)` counts to 1.** Reading one as the
  other makes every mixed colour come out nearly black.
