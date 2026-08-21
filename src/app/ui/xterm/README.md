# xterm

Bytes that arrived from somewhere else.

| file | provides | consumes |
|---|---|---|
| `window.js` | `xterm` | `react` |

```
xterm.Term    <Term ref onData onResize look height />
xterm.look(mode)   the palette for 'light' or 'dark'
xterm.LOOKS        both of them, for a caller building on one
```

The ref is the interface:

```
write(bytes, done)   done fires when xterm has parsed them, not when it returns
clear(done)          same, for the repaint it causes
text({ all })        what is on the screen, or the whole scrollback
fit()  focus()  size
```

**`write` is asynchronous, and the callback is the only way to know.** xterm
parses and renders on its own schedule, so bytes handed over are not on screen
when the call returns. That is invisible to a page streaming output and fatal to
a test, which was how it was found: two animation frames looked like enough and
were not. It is flow control too, for a caller pushing faster than xterm draws.

**`text()` asks the terminal, not the DOM.** xterm picks its own renderer, and
under the canvas one the element's `textContent` is an accessibility buffer
rather than the screen — so anything reading the DOM to find out what a terminal
says is reading an implementation detail that can change under it.

`demo/pages/terminal.js` is the page.

## why not a `<pre>`, and this time it is not about looks

**What comes back from a machine is not text — it is drawing instructions.** A
pty answers with escape sequences that move the cursor, repaint a line, clear the
screen and colour a word, and a `<pre>` renders those as garbage in the middle of
the output somebody is trying to read.

The Terminal page puts the same bytes through both, side by side, so the argument
is shown rather than asserted. Watch the progress bar redraw itself, and watch a
`warn` line get corrected in place by a cursor that went back up.

## light and dark, and the caller picks

`look('light')` and `look('dark')`. Anything it does not recognise is **dark**,
because that is what this app was before there was a choice and a page that
forgets to say should not get a white rectangle.

**The plugin still knows nothing about the theme.** It offers both and lets
whoever knows which mode is showing say so — the same shape as
[editor](../editor/) and [litegraph](../litegraph/), and for the same reason:
every page consumes the theme, so a theme consumed back would be a cycle.

The demo's Terminal page asks the theme for **`showing`, not `mode`**. `mode` is
the setting; `showing` is what the swatch actually painted, and they differ
whenever a dark-only swatch is asked for light. A white terminal in a page that
stayed dark is a hole cut in the window.

**The sixteen ANSI colours are part of the palette, not decoration.** xterm's
defaults are picked for a black terminal, so on a light one the yellows and
greens vanish and the *bright black* a program uses for de-emphasis disappears
entirely. A light terminal that only flips the background is a light terminal
nobody can read.

Dark's `brightBlack` is `#8b949e` rather than the `#6e7681` a github-dark palette
uses: that measures **3.6:1** on this background, under the floor, and it is the
grey that carries prompts and file paths. `#8b949e` is 6.2:1.

**Recolouring never rebuilds.** Flipping the page from dark to light must not
throw away what somebody is reading, so the palette is applied to the live
terminal through `options.theme`. Putting `look` in the dependency list of the
effect that *creates* the terminal would pass every visible check and silently
lose the scrollback on every mode change — which is the same mistake the
ref-instead-of-a-text-prop shape exists to avoid. There is a test for exactly
that, and it was checked by making the mistake.

Both palettes are built once, so their identity is stable: a fresh object per
call would recolour on every render of the page.

## it moves no bytes itself

Nothing here opens a connection, spawns anything, or knows what a machine is. It
is a **surface**: write to it, read what was typed into it, size it to its box.
Whatever carries the bytes is somebody else's plugin.

**And there is no pty, which is the point.** A terminal usually implies one,
which on Windows means `node-pty` — a compiled dependency that has to match the
Node ABI nw.js was built against, and that is exactly the kind of thing this
project does not have. It is not needed: `ssh -tt` allocates the pty on the
machine at the far end, which is where the shell actually is.

## a ref, not a prop

Output arrives continuously and is **appended**. A `text` prop would re-render
the terminal on every chunk, and re-rendering a terminal means throwing away the
scrollback somebody is reading. So the caller holds a handle and writes into it,
and the effect that builds the terminal runs **once**.

`clear()` for the same reason: cleared rather than rebuilt.

## three things that had to be measured

- **It cannot lay out without its stylesheet.** With no stylesheet the rows
  stack at the browser's default line height and the cursor lands nowhere near
  the text. Nothing throws; it just looks wrong. `window.test.js` asks the
  document whether a `.xterm` rule is there, because that is the only assertion
  that actually catches it — see below.
- **Fit after the box exists, not before.** xterm measures its container to work
  out how many columns fit, and a container the browser has not laid out yet
  measures zero — which gives a terminal one column wide that never recovers on
  its own. The `ResizeObserver` is what catches that first frame.
- **Resize with the box, because the far end has to be told.** A pty that thinks
  it is 80 columns while the window is 200 wraps every line in the wrong place,
  and the person reading it sees a terminal that is subtly broken rather than one
  that is the wrong size.

## the box is the caller's, and it may not be content-sized

The observer above and xterm's own fit feed each other if the height comes from
the content: fit picks rows, the rows make the box taller, the observer sees a
taller box, fit picks more rows. So `height` is a **value and not a flag** —
there is no "size yourself".

## a cursor that blinks only where something can be typed

`cursorBlink` and `disableStdin` follow whether an `onData` was given. A captured
console is being *read*, and a blinking cursor on it is a promise that a keystroke
goes somewhere.

## disposed, not left

xterm attaches listeners and a canvas. A page that mounted one per selection would
leak a terminal per click — the same reason [editor](../editor/) destroys its ace
instance.

## the tests

`window.test.js`, run inside the app. Each was checked by breaking the thing it
watches and confirming it — and only it — went red.

| test | what breaking it looks like |
|---|---|
| is a component and two palettes | `look()` stops defaulting to dark, or its result stops being stable |
| carries a full ansi palette on both sides | a palette is added that only flips the background |
| recolours a live terminal without throwing away what is in it | `look` gets into the create effect's dependencies |
| has its stylesheet in the document | `xterm.css` stops being injected |
| measures a cell and a box, and so has a size | the terminal is mounted where nothing has a box |
| writes bytes, and reads escape sequences rather than printing them | a `<pre>` would show the `[32m` |
| clears without being rebuilt | `clear()` stops working, or starts rebuilding |
| takes its element with it when it goes | `dispose()` stops being called |

**The obvious assertion did not work, and that is why the rule is to sabotage
first.** `cols > 1` looks like proof that a character cell was measured, and is
not: xterm measures from the font in its own **options**, so cols and rows come
out correct with no stylesheet at all. Commenting the `require` out and
re-running was the only way to find that out — the suite stayed green. Hence a
test that asks the document directly.

Note that a hot reload will not show you this. style-loader's `<style>` tag
survives, so the page keeps a stylesheet the new bundle no longer injects; the
app has to be restarted for the sabotage to be real.

**`clear()` keeps the current line.** It is written for a prompt, where the line
you are typing on should survive, so the test writes lines ending in a newline —
otherwise it is asserting about a line `clear()` never promised to remove.

## the vendor folder

xterm is 488KB and belongs to exactly one concern, and `webpack.config.js` keeps
every `vendor/` folder away from babel. Like [editor](../editor/), it knows
nothing about the theme: every page consumes the theme, so a theme that consumed
this back would be a cycle.
