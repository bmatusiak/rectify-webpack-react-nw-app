# banner

Something true about the app, said across the top of it.

| file | provides | consumes |
|---|---|---|
| `window.js` | `banner` | `react`, `theme` |

```
banner.Banners      <Banners className /> — render wherever they belong
banner.raise(opts)  -> id.  { id, variant, text, icon, dismissible, onDismiss }
banner.lower(id)    one by name, or all of them when told nothing
banner.list()       what is up now
banner.onChange(fn) -> unsubscribe
```

## bootstrap has no such component

It has an **alert**, which is an inline block with a margin and rounded corners
meant to sit in a column of content; a **toast**, which goes away; and **modals**
and **offcanvases**, which block the page. A bar under the title bar that stays
until the thing it is about stops being true is none of those, and every app ends
up building one. There is no `.banner` anywhere in bootstrap 5.3.

So this is an alert with its box model flattened — `mb-0 rounded-0 border-0` —
which is what bootstrap's own documentation site does with a hand-rolled
`.bd-banner`.

**Being an alert is the point, not a shortcut.** [theme](../theme/) sets an
alert's colour and background *together*, because several bootswatch builds
override one and not the other and leave text coloured for a background it is not
on. A banner inherits that, so it was readable on all twenty-eight swatches the
day it was written rather than after somebody measured it — the first one raised
in anger measured **15.81:1** without a line of styling of its own.

## it consumes the theme, and that is the difference

[editor](../editor/), [markdown](../markdown/), [xterm](../xterm/) and
[litegraph](../litegraph/) each wrap a vendored library and know nothing about
the theme, because the theme is a slot somebody may replace.

This is not a surface. It is a composition **of** the kit, so it asks for the
kit. Nothing in the theme consumes this back, so there is no cycle — and if that
ever changes, this is the plugin that has to move.

## a service and a component

What raises a banner is usually not what renders it: the node half failing to
reload, a socket dropping, a swatch refusing the mode somebody asked for. So the
list lives in the service and anything in the window can add to it, while one
`<Banners/>` renders whatever is there.

The theme's `Page` has a slot for it, between the header and the sidebar split,
so a banner spans the sidebar as well as the content:

```jsx
<Page banner={<banner.Banners />} header={<Navbar … />} … />
```

`Page` only renders what it is given there and knows nothing about this plugin,
which is what keeps the kit replaceable.

## three details that are not arbitrary

**Raising the same id twice replaces it.** A plugin watching a state will say the
same thing every time that state moves, and three copies of *the node half failed
to reload* are not three times as true.

**Dismissal goes through the service.** Bootstrap's `data-bs-dismiss` removes the
element from the dom and tells nobody — the service would still be holding a
banner that is no longer on screen, and would put it back on the next render. So
the close button is ours and calls `lower`.

**The strip carries a class.** Without `.app-banners`, the only way to find a
banner is `.alert`, which also matches every alert in the page's content: nothing
could tell *the app is saying something* from *this page contains a notice*,
including a test.

## what the demo says with it

Two things it already knew and was saying quietly or not at all:

| | was | now |
|---|---|---|
| a swatch that refuses the mode | a disabled toggle with a tooltip | a warning banner naming the swatch and why |
| the socket dropped | a coloured dot in the footer | a danger banner saying nothing on the page can reach the app |

The second matters more than it looks. This app has already learned once that **a
page whose socket is dead looks exactly like a working one** until you click
something.

## the tests

`window.test.js`, run inside the app — the list can be checked anywhere, but
whether it inherited the alert's readability needs a laid-out document.

Two things bit while writing them, both worth keeping:

- **The harness has no `deepEqual`.** It runs inside the app, where node's assert
  is not a given — `ok`, `equal` and `notEqual` only.
- **The service belongs to the running app, not to the suite.** The demo raises
  real banners on it, so a test that expects the list to be empty fails whenever
  the app has something to say, and a test that calls `lower()` in its cleanup
  turns off something the user was being told. The ones that clear everything
  snapshot the list first and put it back.
