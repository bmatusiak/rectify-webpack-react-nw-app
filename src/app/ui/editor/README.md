# editor

Code that is **read**.

| file | provides | consumes |
|---|---|---|
| `window.js` | `editor` | `react` |

```
editor.Code    <Code text mode tall look />          what nearly every caller wants
editor.Diff    <Diff left right mode height look     side by side, and a merge tool
                     editable onChange onDiffReady />
editor.Editor  <Editor text mode min max look />     the instance, for what the two will not do
editor.look(m) the palette for 'light' or 'dark'
editor.LOOKS   both of them, built once
editor.LID     the maxLines a diff asks for
```

Ace and ace-diff, and the three modes this app actually reads.
`demo/pages/editor.js` is the page.

## why not a `<pre>`

It is an argument about approvals rather than about looks. Two things in an app
like this are read closely enough for a decision to hang on them: the source of
a job somebody has to approve, and a branch's diff somebody has to judge. **A
hundred lines of undifferentiated JavaScript is not something a person reads** —
it is something a person scrolls past and then approves anyway, which defeats
the whole point of putting it on the screen.

## read-only in four ways, not one

The content is not editable; the cursor is hidden so it does not invite one; the
active-line highlight is off for the same reason; and the syntax worker is never
started. Nothing here is a place to write code, and it should not look like one
for even a moment.

The worker is not only tidiness — it is a thread and a round of parsing spent to
put squiggles under somebody else's code.

## plain text unless asked otherwise

The default matters more than it looks. Most of what this app puts up to be read
is **prose**, and highlighting prose as JavaScript colours `delete`, `do`, `in`
and `that` at random. On a document about what somebody may *not* do, that is
false emphasis on the one thing that has to be read every line of.

The Editor page shows the same four sentences both ways, side by side, which is
the whole argument in one screen.

`ace/mode/text` needs no mode file; it is in the core. The three that are
`require`d — javascript, markdown, diff — each call `ace.define(...)` against the
global ace sets up, so pulling them into the bundle **registers** them. Ace's own
default is to set `basePath` and fetch them at run time, which is the right
answer for a page with no build step and the wrong one for a packaged app with
no server.

**They are not independent.** Ace's markdown mode pulls the javascript rules in
for fenced code blocks, so `mode-javascript.js` can be deleted and javascript
still highlights. All three had to go before the test noticed. Worth knowing
before trimming the list to save bytes.

## the lid

With `maxLines` set, ace lays out **every** row rather than only the visible
ones. That is fine for a script somebody wrote and not fine for a
ten-thousand-line machine-generated diff, which would lay out fifty thousand rows
and take the window with it. `tall` is that lid; everything read whole does not
ask for one.

**Ace measures its own laid-out rows, after wrapping, and sizes the box to
them.** Arithmetic here would be wrong twice over: too short, because a long
thing hits a clamp and gets a scrollbar inside a page that already scrolls —
which is how a hundred lines gets scrolled past and approved anyway — and too
tall, because `wrap` turns one long line into three screen rows and counting
newlines cannot know that.

A height *is* guessed for the first frame only, because ace measures its
container to lay out and a container with no height renders an editor with no
rows in it — which looks exactly like an empty file. Ace owns it from the second
frame, and the guess is cleared so it cannot fight.

## the diff, which is one component with two jobs

```jsx
<Diff left={before} right={after} mode="javascript" height={300} look={look} />
<Diff left={ours} right={theirs} editable onChange={setRight} onDiffReady={fn} />
```

Read-only it is a picture of a change somebody has to judge: both sides locked,
the scroll tied together, a gutter drawing what moved where. With `editable` the
right side takes typing and the gutter grows copy arrows, which makes it a place
to **resolve** a change rather than only look at one.

They are the same component because they are the same geometry. The difference
is whether anything may move.

**The left side is never editable, in either job.** What is being judged is the
change *from* the left, so a left that can be edited is a diff that can be made
to say anything.

**Not wrapped, and that is not a preference.** Every position ace-diff draws —
the bands, the connectors, the arrows — is a document row times a line height. A
wrapped line is one document row and two screen rows, so with `wrap` on the
connectors slide further out of place the further down the file somebody reads.
A horizontal scrollbar is the price, and it is the right one here.

**A definite box, for the same reason as [xterm](../xterm/) and
[litegraph](../litegraph/).** ace-diff's own wrapper is `position: absolute; top:
0; bottom: 0`, so a container sized by its content gives it nothing at all.

**Callbacks go through a ref.** A page passing an inline `onChange` would
otherwise tear down and rebuild two ace editors on every render of the page
around it — and with `editable` on, that is somebody's typing.

`onDiffReady` hands back the library's own list, so the demo's *how far there is
to go* is a count from ace-diff rather than lines counted again on the page. Note
that the default granularity is broad: adjacent changed lines are **one**
difference, not one per line.

## light and dark, and the caller picks

`look('light')` and `look('dark')`. Anything it does not recognise is **dark**,
because that is what this was before there was a choice. `Code`, `Editor` and
`Diff` all take it.

**A palette here is two things**, because a diff is two things: an ace theme for
the text, and the custom properties ace-diff paints its gutter, connectors and
bands with. Flip only the first and the diff bands stay drawn for the ground they
are no longer on; flip only the second and the code stays dark inside a light
frame.

The dark numbers are upstream's own `styles-twilight.css` — its preset for a dark
ace theme. Only the base stylesheet is vendored; that one is **not**, because two
stylesheets both targeting `.acediff` cannot be switched between anyway: **two stylesheets both targeting `.acediff` cannot be switched between**:
whichever webpack injects last wins for good. As custom properties the nine
numbers are one `setProperty` call each, and a file nothing requires is a file
that goes stale.

**And they go on the element ace-diff makes, not on ours.** It wraps the
container's contents in its own `<div class="acediff">`, and the stylesheet sets
the light defaults *on that class* — so a value inherited from a parent loses to
it, and putting the palette on our own element does nothing at all.

`ace/theme/textmate` needs no file: it is ace's default and is in the core build,
the same way `ace/mode/text` is.

**Recolouring never rebuilds**, the lesson [xterm](../xterm/) learned. With the
palette in the dependency list of the effect that builds the diff, going from
dark to light would throw away the scroll position and, while merging, whatever
had been typed — and every other test would still pass.

## the tests

`window.test.js`, run inside the app, because ace measures a container to lay out
and counts its own rows after wrapping — none of which exists outside a real
document.

| test | what breaking it looks like |
|---|---|
| renders the text it was given | ace never attaches, or lays out no rows |
| highlights javascript | the mode rules are not in the bundle |
| highlights a diff differently from plain text | `mode-diff.js` stops being required |
| leaves prose alone unless a mode was asked for | the default stops being `text` |
| will not take a keystroke | `setReadOnly` is dropped |
| takes its element with it when it goes | `destroy()` stops being called |
| hands out a diff, and two palettes | `look()` stops defaulting to dark, or a palette stops carrying both halves |
| draws two editors and a gutter, in the box it was given | the container stops being given a height |
| marks the lines that differ, and marks nothing when they do not | the diff stops being computed, or marks everything |
| draws a connector across the gutter, not just a band on each side | `showConnectors` goes off, or the gutter svg is measured before it is laid out |
| is read-only until asked, and then only on the right | the left side becomes editable, or `editable` stops reaching ace |
| copies a change across when an arrow is clicked, and says what it now says | the arrows stop working, or `onChange` stops reporting |
| draws no arrows when it is only being read | `copyLinkEnabled` stops following `editable` |
| paints the gutter in the palette it was given | the custom properties go on the wrong element |
| recolours without building the editors again | the palette gets into the build effect's dependencies |
| takes new text without building the editors again | the text is set by rebuilding both sides |
| takes both editors with it when it goes | `destroy()` stops being called on the diff |

**Three of these started out not testing anything.** The two below, and one of
the diff tests: `.acediff__left .ace_editor` matches nothing, because ace puts
its class **on** the element ace-diff made rather than on a child inside it. Two
assertions were comparing `null` with `null` and passing for it. Anything
claiming *the same element* has to say first that there was one.

**Two of these started out not testing anything.** The diff one counted elements
whose class contained `ace_` and passed happily with `mode-diff` commented out,
because ace's own structural markup matches that. It renders the same text twice
now — once with the mode, once without — and asks whether the token classes came
out different, which is what *the mode loaded* actually means without this file
needing to know what ace calls an inserted line.

And the javascript one claims less than it used to: what it proves is that the
rules are **present**, not which file brought them.

**A fixed number of frames is not a result.** These waited two animation frames
for ace, which was enough on an idle machine and not enough with the whole suite
running — so the editor tests failed only in the full run, which is the worst way
to find out. They wait for the thing itself now, via `view.until(...)` from
`core/selftest/mount.js`.

Careful what you wait for: plain text has **no** tokens, so waiting for a
non-empty token set on the unhighlighted half of the comparison waits forever.

## the vendor folder

Ace is 900KB and belongs to exactly one concern. In the shared vendor folder it
would look like something the app needs; what the app needs is *show me this
text so it can be read*. Swap this plugin and the pages do not change.

`ace-diff` is beside it, built from its own source with the project's own
`npm run build` (tsdown, then sass) and vendored as the CJS bundle plus its
stylesheet. It carries `@sanity/diff-match-patch` inside it, and `ace-builds` is
a **type-only** import there — so the bundle has no ace in it and takes ours
through `options.ace` rather than off `window.ace`, which this app does not have.
The `sourceMappingURL` comments are stripped, because the maps are not vendored.

`webpack.config.js` keeps every `vendor/` folder away from babel. These are
shipped builds — already down-levelled, and written against a top-level `this`
that babel rewrites to `undefined` the moment it decides a file is a module.

## it knows nothing about the theme

Deliberately. Every page consumes the theme, so a theme that consumed this back
would be a cycle. It offers both palettes and lets whoever knows which mode is
showing say so; `demo/window.js` consumes both and hands them to the page, which
asks for `theme.showing` rather than `theme.mode` — a dark-only swatch asked for
light stays dark, and a white pane in it would be a hole cut in the window.
