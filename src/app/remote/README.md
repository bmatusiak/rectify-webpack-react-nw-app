# remote

Click, fill and read the page — from the terminal, or from a test.

| file | provides | consumes |
|---|---|---|
| `window.js` | `remote` | `io` |
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
```

`capture` gave it eyes; these are the hands. The window half is the only place
that can touch the document, so the clicking happens there and the rest is
plumbing to reach it.

It also **provides `remote`** in the window, because the three verbs are wanted
in the page as well as over the wire — a test cannot use the socket to reach
them, since emitting on it sends to the *server* rather than back to this window.

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

Nothing in the page can tell them apart on its own: nw 0.114 sends an ordinary
chrome user agent, and the window deliberately has no node in it to ask. So the
page says which it is, two ways —

- development: `?view=app`, put there by [window](../core/window/) when it opened it
- packaged: `window.__host`, injected by [bridge](../core/bridge/) before any of
  the page's own script ran, which a browser could not produce

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
