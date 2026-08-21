# editor

Code that is **read**.

| file | provides | consumes |
|---|---|---|
| `window.js` | `editor` | `react` |

```
editor.Code    <Code text mode tall />     what nearly every caller wants
editor.Editor  <Editor text mode min max /> the instance, for the thing Code will not do
editor.LID     the maxLines a diff asks for
```

Ace, and the three modes this app actually reads. `demo/pages/editor.js` is the
page.

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

`webpack.config.js` keeps every `vendor/` folder away from babel. These are
shipped builds — already down-levelled, and written against a top-level `this`
that babel rewrites to `undefined` the moment it decides a file is a module.

## it knows nothing about the theme

Deliberately. Every page consumes the theme, so a theme that consumed this back
would be a cycle. `demo/window.js` consumes both and hands them to the page.
