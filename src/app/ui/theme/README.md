# theme

An example kit, not the scaffold's opinion.

| file | provides | consumes |
|---|---|---|
| `window.js` | `theme` | `react`, `preferences`, `appPackage`, `may` |

```
theme.ui             every component, from ./components
theme.themeSwitcher  flips light/dark, remembered in the preferences store
theme.mode           which of the two was asked for
theme.showing        which of the two the swatch actually painted
theme.modeLocked     true when the swatch will not honour the mode
theme.onModeChange   so a component can re-render when it flips
theme.swatches       the stylesheets in ./swatch, by name
theme.icons          every name <Icon> answers to, read off the sprite
theme.swatch         which one is worn
theme.setSwatch      wear a different one, now
theme.bs             bootstrap's own javascript
theme.$              jquery, this kit's dom helper
```

## the icons are a list, because they were already a document

The sprite is one svg injected once — 2,078 symbols, about 1.1MB of markup —
so every `<Icon>` resolves against it without a second request. `theme.icons`
is the names in it, **read out of that same string** rather than listed here:
a hand-kept list is two thousand strings maintained against a file that ships
its own, and it is wrong the first time bootstrap-icons adds one.

It is read off the source rather than queried out of the document, so it does
not depend on when the sprite reaches the dom — and `window.test.js` checks the
two agree, name for name, which is the only thing that would catch a regex that
quietly stopped matching.

Sorted and frozen: the Cheatsheet page maps over it directly, so a caller that
sorted it in place would be reordering what everything else is about to draw.

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

## the same mistake, three more times

Every one of these was something taking its colour from a value that was already
wrong, and each was found by measuring rather than looking:

| | was | now |
|---|---|---|
| inline `code` | 3.82:1 on white, **1.49:1** in an alert | takes the colour of the text around it |
| alerts | **1.6:1** on flatly | background and text set as a pair |
| sidebar links | 3.4 / 2.63 / 4.27:1 on minty, morph, spacelab | from `--bs-emphasis-color` |

**`code` is `color: inherit`, and the route there is the lesson.** It started as a
tint — three quarters of the surrounding text mixed with the primary — which
reads as an accent and passed on most swatches. superhero came out at 3.77:1;
dropping the tint to 15% moved it to 4.13, still under. The number was never the
problem: that `code` sits on a **panel**, not the page, and a mix toward one fixed
swatch colour lands differently on every background it is used over. There is no
percentage that is safe on all of them. The monospace face is distinction enough,
and it is distinction that cannot cost anything.

**An alert's text and background have to be set together.** Several bootswatch
builds override the background alone — flatly says
`--bs-alert-color: var(--bs-secondary-text-emphasis)` and then
`background-color: #95a5a6` — so the text is coloured for a pale tint and put on
a solid mid grey. Restoring just the background made it **worse**, 1.18:1, because
flatly also forces white alert text. Half a pair is not a pair.

**The sidebar took `--bs-body-color`**, which looks like the safest possible
choice — whatever this swatch uses for its own text — and inherits the swatch's
mistakes with it. minty's body colour measures **3.54:1 against its own
background**: its prose is under the floor before this shell touches it.

That last one went beyond the sidebar: **ordinary prose on minty was below the
floor too**, on every page, and nothing here overrode it. It does now — the body
colour is 92% of the emphasis colour, the same proportion the sidebar uses,
because that is the strength of *text you are meant to read* where 82% is *text
that is deliberately secondary*.

It repaints every swatch's body text rather than the three that are short, which
is a design decision and was left alone for a while on purpose. What settled it
is that the ordering was backwards: on minty the subtitles measured **13.6** and
the prose under them **3.54**, so the text meant to recede was the readable half.
Now it is 18.36 against 13.6.

**And the rule has to outrank the swatch on the same element.** A swatch declares
`:root, [data-bs-theme=light] { --bs-body-color: … }`, and `window.js` puts
`data-bs-theme` on the **body** — so that attribute rule lands on the element a
bare `body { … }` was trying to paint, at (0,1,0) against (0,0,1), and wins
whichever stylesheet loaded last. Measured the confusing way round: the rule was
in the bundle, on the page, and doing nothing.

**A carousel caption is white**, because bootstrap assumes a photograph behind
it. The slides in this kit are `bg-body-*` surfaces, so the captions on the
Disclosure page sat at **1:1** — white on near-white, invisible on a page that
had been screenshot dozens of times. They take the emphasis colour now.

None of it was caught for so long because `tools/drive.js` measured headings and
muted text and nothing else. It measures inline `code`, alerts and **the prose
itself** now — the plain `<p>` that most of this app is made of was never asked
until the paragraph above was written. A check that only looks at headings will
keep finding headings.

`npm run drive -- --swatches` is what holds this up: 28 swatches in both modes,
every heading, paragraph, piece of muted text, inline `code` and alert measured. It is how the three above
were found and how they stay found.
