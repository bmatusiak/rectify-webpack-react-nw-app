# theme

An example kit, not the scaffold's opinion.

| file | provides | consumes |
|---|---|---|
| `window.js` | `theme` | `react`, `settings`, `appPackage` |

```
theme.ui             every component, from ./components
theme.themeSwitcher  flips light/dark, remembered in the settings store
theme.mode           which of the two was asked for
theme.showing        which of the two the swatch actually painted
theme.modeLocked     true when the swatch will not honour the mode
theme.onModeChange   so a component can re-render when it flips
theme.swatches       the stylesheets in ./swatch, by name
theme.swatch         which one is worn
theme.setSwatch      wear a different one, now
theme.bs             bootstrap's own javascript
theme.$              jquery, this kit's dom helper
```

Bootstrap, jquery and bootstrap-icons are here because **something had to be**.
Bringing your own is the expected thing to do — tailwind, plain css, a component
library, or nothing at all all fit the same slot.

**`theme` is the only name anything outside this directory knows.** A plugin asks
for `theme` and reads `theme.ui`. So a kit swap is this whole directory replaced
by one that provides the same service with whatever it carries. None of the
names above are required of a replacement either; they are what this kit
provides and what the demo happens to use.

`$` is deliberately not a top-level service — another kit may not want one.

## the components

`theme.ui` covers what bootstrap's examples do:

| file | what is in it |
|---|---|
| `ui.js` | `Alert Badge Button ButtonGroup Card ListGroup Table Spinner Progress Placeholder Icon` |
| `form.js` | `Form Input Textarea Select Check Range InputGroup` |
| `nav.js` | `Navbar Tabs Breadcrumb Pagination Sidebar` |
| `overlay.js` | `Modal Offcanvas Toasts Tip Dropdown` |
| `disclosure.js` | `Accordion Collapse Carousel` |
| `layout.js` | `Page Section Hero Footer Features Pricing Album Stats` |
| `examples.js` | the page shapes the demo's bootstrap-example pages are built from |

The split is deliberate: **anything bootstrap drives from a data attribute is
left as markup**, and only the parts that need one of its instances — modal,
offcanvas, tooltip, popover, carousel — create and dispose one. That is why
those two files are factories taking `bootstrap`, and the rest are plain.

The icon sprite is one document injected once, so every `<use>` in every
component resolves without another request.

## swatches

`./swatch/<name>/bootstrap.min.css`, and **the folder is the registry** —
`swatches.js` reads it with `require.context`. Drop a bootswatch build in and it
appears; delete one and it does not. 27 of them, plus stock bootstrap as
`default`.

Webpack emits each as its own file rather than inlining it, so only the chosen
one is ever fetched and parsed, and a swap needs no rebuild.

**The link goes at the very top of `head`**, before anything style-loader has put
there or will put there. That ordering is the whole reason this kit's own rules
can correct a swatch: appended, the link came last, and a swatch's
`.text-body-secondary { … !important }` beat ours on source order alone — same
specificity, same importance, later wins.

Two things worth knowing before shipping all of them:

- They are **~230kb each**, and they are all in the package. Inside `main.bin`
  they took it from 4mb to 17mb, so `tools/build.js` ships them as files beside
  the binary — they are not code. Deleting the folders you will not use is how
  to get the rest back.
- **20 of the 27 pull their fonts from Google Fonts** with an `@import`. A
  desktop app that is offline falls back to a system face, so the colours arrive
  and the typography does not. Self-hosting them, or picking from the seven that
  do not, is the fix.

## the mode and the swatch can disagree

Eight of the bootswatch themes are **dark designs**. Asking one of those for
light mode gets you a dark page either way.

So the honest thing is to **believe the stylesheet rather than the setting**:
ask for what was wanted, then look at what the body actually became, and make
`data-bs-theme` say *that*. The shell then always agrees with the page it frames,
and `modeLocked` is how the toggle knows to disable itself and say why — a
control that offers a choice it cannot honour is worse than one that says so.

**`mode` is the setting; `showing` is the answer.** They differ whenever a
dark-only swatch is asked for light, and **anything choosing a colour wants
`showing`** — the demo's Terminal page picks its terminal palette from it, because
a white terminal in a page that stayed dark is a hole cut in the window.
`modeLocked` is the same fact stated as a boolean, for a control that has to
disable itself.

Order matters twice here:

- **Ask first, then measure.** Measuring without asking measures the answer to
  the last question, which is how a page that went dark once could never be
  asked back.
- **Measure on `link.onload`.** A stylesheet that has not arrived yet still
  measures as the last one.

## what a swatch is allowed to change

Everything the shell paints is mixed from `--bs-body-bg` and `--bs-body-color` —
the two custom properties **every** swatch sets — rather than from bootstrap's
`bg-body-tertiary`. That utility looks like the right answer and is not: the
bootswatch **dark** themes redefine it only under `[data-bs-theme=dark]`, so
picking one in light mode left the sidebar the light grey it is at `:root` while
the text followed the swatch, and the navigation disappeared.

Three things a swatch styles for a page it expected, not the one it got:

- **Headings** point at `--bs-heading-color`, which a swatch may pin once and
  never mention again. `lux` sets `#1a1a1a` at `:root` and says nothing about
  dark, so its headings came out `#1a1a1a` on `#1a1a1a` — a contrast ratio of
  exactly **1**.
- **Muted text** reads `--bs-secondary-color`, and some set it pale enough to
  fall under the 4.5 floor.
- **A navbar** carries its own palette written for a coloured bar, which drew
  `darkly`'s brand at **1.1** against the surface behind it.

All three are mixed from `--bs-emphasis-color` instead, the one bootstrap
guarantees stands against the background either way.

`npm run drive -- --swatches` is what holds this up: 28 swatches in both modes,
every heading and every piece of muted text measured. It is how the three above
were found and how they stay found.
