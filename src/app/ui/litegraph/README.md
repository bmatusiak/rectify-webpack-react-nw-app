# litegraph

Things, and what connects them.

| file | provides | consumes |
|---|---|---|
| `window.js` | `litegraph` | `react` |

```
litegraph.Graph      <Graph nodes links height fit onSelect look />
litegraph.look(m)    the palette for 'light' or 'dark'
litegraph.LOOKS      both of them, built once
litegraph.LOOK       what a caller that says nothing gets -- dark
litegraph.LiteGraph  .LGraph  .LGraphCanvas   the library, for what Graph will not do
```

`demo/pages/graph.js` is the page, and it draws **this app's own dependency
graph**.

## why not a list

The Data page already lists these services, sorted and paginated, and a list is a
perfectly good way to answer *is `preferences` there*. It is a bad way to answer
**what happens if I delete `io`** — that is a question about shape, and from a
list a reader works shape out by holding it in their head.

rectify keeps the resolved graph on the `app` service as `app.plugins` — frozen
`{ name, provides, consumes }` records, in load order, because only the container
can know it. The `name` is the folder path, stamped by the boot through
`src/target.js`; without that every record is called `plugin`, which is what
every setup function in this app is called. Left to right on the page is that load order: nothing is drawn until
everything feeding it has been.

## it takes a description, not a graph

```js
<Graph
    nodes={[{ id, title, inputs: ['a'], outputs: ['b'], pos: [x, y], colour, background }]}
    links={[{ from: 'id', out: 0, to: 'id', in: 0 }]}
    height={420}
    fit
    look={litegraph.look('dark')}
    onSelect={function (id) { ... }} />
```

litegraph's own API — `registerNodeType`, `addInput`, `connect`, the canvas
lifecycle — stays behind this file. So a caller cannot half-learn litegraph, and
replacing this plugin with a different renderer does not touch a single page.

**One node type, registered once.** litegraph is built for graphs that *run*:
every node is a class with an `onExecute`, registered by name before one can be
created. Nothing here runs — these are boxes with named ports — so there is a
single type that draws whatever it was told to.

**A link naming a node that was never defined draws the rest of the graph.** That
is the caller's bug, not a crash.

## light and dark, and the caller picks

`look('light')` and `look('dark')`. Anything it does not recognise is **dark**,
because that is what this was before there was a choice -- the same shape as
[xterm](../xterm/) and [markdown](../markdown/), and for the same reason: every
page consumes the theme, so a theme consumed back would be a cycle.

**A canvas inherits nothing.** litegraph paints every pixel itself, so there is
no cascade to take a colour from and the whole palette has to be handed over --
exactly the position a document in an iframe is in. Five colours: the ground, a
node's body, its title bar, its text, and a link.

The demo's Graph page asks the theme for **`showing`, not `mode`**, and it
recolours **its own nodes with it too**. The test nodes on that page carry an
explicit colour, and dark titles that read well against the dark ground were
unreadable the moment the ground went white -- a plugin cannot fix that, because
those colours are the page's.

## it fits its box to the graph, when asked

```jsx
<Graph nodes={...} links={...} height={420} fit />
```

Without `fit` the box is the `height` given, which is what it always was. A graph
with four nodes and a graph with thirty got the same number: the small one was
mostly empty, and the big one was **cut off at the bottom with nothing saying
there was more**.

The nodes know where they ended up, so it does not have to be guessed. After the
graph is built, `extentOf` takes the topmost head and the lowest foot and the box
becomes the distance between them plus padding. litegraph's `pos` is the top-left
of the **body**, with the title bar drawn above it, so `NODE_TITLE_HEIGHT` comes
off the top -- without that the first row is clipped by exactly one title bar,
which looks like a rendering glitch rather than an arithmetic mistake.

`height` stays the **floor**, so a graph with two nodes in it does not collapse to
a strip. And it is still a definite pixel height on the container: a canvas fills
what it is given, and a container sized by its own content gives it nothing.

## it is not UMD

It is `(function (y) { ... })(this)`, repeated once per bundled node pack, and
`this` at the top of a webpack module is that module's exports — not the window.
That works out, because every pack in the file shares the one module and
therefore the one object.

**What does not work out is babel.** It decides a file is a module and rewrites
top-level `this` to `undefined`, at which point the library throws on its first
line. `webpack.config.js` keeps every `vendor/` folder away from babel, which is
what makes this a plain `require` rather than a script tag.

Two places inside the library reach for a **global** `LiteGraph` rather than the
one they were handed. Neither is on any path this app takes, but a
`ReferenceError` out of a vendored file is a miserable thing to diagnose, so the
namespace is put where they look.

## a canvas has two sizes

The css one stretches whatever was drawn; the attribute one is how many pixels
there are to draw into. Setting only the first gives a graph that blurs as the
window widens — and litegraph reads the **attributes** to hit-test, so a click
would land somewhere the cursor is not.

**It is resized through `LGraphCanvas.resize()`, not by assigning
`canvas.width`.** That started as the assignment, which looks equivalent and is
not: setting the attribute resets the 2d context, and litegraph keeps a second
background canvas that would be left at the old size. Its own `resize()` does
both — and when called with no arguments it reads the parent's `offsetWidth`
itself.

That was found by deleting the assignment and watching every test still pass,
which is what sent me looking for what was really doing the work.

**And the observer is not optional.** litegraph only re-reads its box when
`autoresize` is on, and that is off here because it re-measures on every mouse
move. Nothing else follows the box: litegraph sizes the canvas once at
construction, so the size at mount says nothing about the size after a resize.

The box must be a definite one, exactly as in [xterm](../xterm/): a canvas fills
what it is given, and a container sized by its own content gives it nothing.

## the tests

`window.test.js`, run inside the app. Each was checked by breaking the thing it
watches.

| test | what breaking it looks like |
|---|---|
| hands out a component, the colours, and the library | babel gets at `vendor/` and the top-level `this` becomes undefined |
| carries two palettes, and defaults to dark | `look()` stops defaulting, or its result stops being stable |
| paints the canvas in the palette it was given | the ground is painted from a fixed colour rather than the one asked for |
| draws into a canvas sized to its box | the canvas is left at its default 300×150 |
| fits its box to the graph when asked, and not otherwise | `fit` is ignored, or it starts resizing a box nobody asked it to |
| does not shrink below the height it was given | `height` stops being the floor and a small graph collapses |
| follows its box when the box changes | the `ResizeObserver` stops calling `measure` |
| paints, rather than leaving an empty canvas | the render loop never starts |
| places a node where it was asked to, and knows what was clicked | the description is ignored, or hit-testing drifts from the cursor |
| draws more when there is more to draw | nodes and links stop reaching the graph |
| takes its canvas with it when it goes | `stopRendering()` stops being called |

**The click test replaced one that read `LGraphCanvas.active_canvas` and counted
`_nodes`.** That was reaching around the very interface this plugin exists to
provide: it would have kept passing if `nodes` were ignored and the graph built
some other way, and it broke the moment that global was not what it had been
guessed to be. Clicking a node at the position it was given and checking
`onSelect` names it proves three things at once — the description was understood,
the node went where it was asked, and the canvas's attribute size matches its css
size, since litegraph hit-tests against the first while the browser delivers the
click in terms of the second.

**And `draws into a canvas sized to its box` cannot catch a missing observer**,
because litegraph sizes the canvas at construction either way. That is what
`follows its box` is for, and removing the observer fails that one alone.

## read, not edit

The same argument [editor](../editor/) makes. A right-click menu offering to add
a node is an invitation to change a picture of something that cannot change, so
the menus and the search box are off. Panning, zooming and dragging a node stay,
because those are reading.

The frame counter and node tally litegraph draws over the top-left corner are off
too: a debugging aid for a graph being built, and this one is finished before it
is ever drawn.

## stopped and released

`LGraphCanvas` runs a `requestAnimationFrame` loop and binds document-level mouse
and key listeners, so a page that mounted one per visit would leave a render loop
running per visit — the same reason [editor](../editor/) destroys its ace
instance.

It cannot draw without its stylesheet either: litegraph paints the canvas itself,
but its context menus and dialogs are real DOM, and unstyled they are unreadable
boxes stacked in a corner. `window.test.js` checks the stylesheet arrived.

## it knows nothing about the theme

Deliberately, like the other three here. It offers both palettes and lets
whoever knows which mode is showing say so; `demo/window.js` consumes this and
the theme, and hands both to the page.
