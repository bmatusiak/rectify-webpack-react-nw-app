# markdown

Markdown, rendered where it cannot do anything.

| file | provides | consumes |
|---|---|---|
| `window.js` | `markdown` | `react` |

```
markdown.Frame     <Frame text height fit look />
markdown.look(m)   the palette for 'light' or 'dark'
markdown.LOOKS     both of them, built once
```

One component, and it is the one part that must not be got wrong.
`demo/pages/markdown.js` is the page.

## why render it at all

A pull request body is markdown that GitHub **will** render, so a preview of it
that is not rendered is a preview of the wrong thing. As source it is a wall of
pipes and hashes, and the one thing it was formatted for is the thing that does
not happen.

## why an iframe, and that is the whole design

**Markdown carries raw HTML through by design.** `marked` does not sanitise it
and has never claimed to. Text that came off a machine running a script somebody
wrote is exactly as trustworthy as that script — and put in this document, its
HTML would be running inside a page that has node behind it.

So it renders into a frame that can do nothing:

| | |
|---|---|
| `default-src 'none'` | every fetch directive falls back to it, `script-src` included |
| `img-src data:` | a remote image cannot turn *somebody opened this* into a request to a host of the author's choosing |
| `srcdoc` | no file is written anywhere to show it |

**`default-src 'none'` is not only about images.** A `<script>` in the markdown
has no source it is allowed to execute from, and an inline `onerror=` would need
`script-src 'unsafe-inline'`, which is not granted either.

## and it is asserted rather than assumed

The Markdown page's document contains **a real `<script>`, a real `onerror` and a
real remote image**, each with the text they would overwrite written beside them.
If the policy ever stops holding, the page says so on sight rather than a comment
here claiming it still does.

Verified against the browser's own refusals rather than by reading the page:

```
Executing inline script violates ... 'default-src 'none''. The action has been blocked.
Executing inline event handler violates ... The action has been blocked.
Loading the image 'https://example.invalid/pixel.png' violates ... "img-src data:".
```

## it fits its box to the document, when asked

```jsx
<Frame text={body} height={320} fit />
```

Without `fit` the box is the `height` given, which is what it always was -- and a
document taller than that scrolls **inside** a panel that is already inside a
scrolling page. Two scrollbars for one document, and the outer one gives no hint
that the inner one exists.

The frame is same-origin, so this side can read what the browser made of the
document and does not have to guess how tall it came out.

**`body.scrollHeight` and not `documentElement`'s.** In standards mode the
viewport propagates from the root element, so the root's scrollHeight is never
less than the box it is in -- measure that and the frame grows to the tallest
document it has ever shown and never comes back down. The body is laid out to
its content, so it answers the question that was asked. That is the one
difference `comes back down when the document gets shorter` exists to catch:
with the root measured instead, every other test here still passes.

**`onLoad` settles it, and the effect only covers the rest.** A new `doc` string
is a new `srcdoc`, which is a reload: measuring from an effect at that moment
reads the document on its way out. The effect handles `fit` being switched on
over a document that is already there, and owns a `ResizeObserver` -- because a
narrower frame re-wraps the text and **no load event fires for a resize**.

`height` stays the **floor**, so one line does not collapse the panel.

## light and dark, and the caller picks

`look('light')` and `look('dark')`, handed to `<Frame look={...} />`. Anything it
does not recognise is **dark**, because that is what this was before there was a
choice -- the same shape as [xterm](../xterm/) and [litegraph](../litegraph/),
and for the same reason: every page consumes the theme, so a theme consumed back
would be a cycle.

**A frame inherits nothing, and that makes this more than a colour or two.**
Everything else on the page takes its colours from the page around it. A document
in an iframe has no page around it -- `srcdoc` is a document of its own, with its
own root and no cascade reaching in -- so the whole stylesheet has to be handed
over, twice. That is why these are two complete palettes rather than a background
and a foreground.

Both are built once, so `look(mode)` returns the same object every time. A fresh
style string per call would be a fresh `srcdoc` per render, and a frame handed a
new `srcdoc` reloads: the document would be reparsed, and anything scrolled to
would jump back to the top on every render of the page around it.

The demo's Markdown page asks the theme for **`showing`, not `mode`** -- `mode`
is the setting, `showing` is what the swatch actually painted, and they differ
whenever a dark-only swatch is asked for light. A white document in a window that
stayed dark is a hole cut in it.

## the tests

`window.test.js`, run inside the app. The frame is same-origin — there is no
sandbox attribute, deliberately — so a test can read what the browser made of the
document, which is the only way to check a policy that a browser has to enforce.

| test | what breaking it looks like |
|---|---|
| hands out the frame and nothing else | the plugin starts providing more than the one part that must not be got wrong |
| carries two palettes, and defaults to dark | `look()` stops defaulting, or its result stops being stable |
| paints the document in the palette it was given | the style is built from a fixed palette rather than the one asked for |
| renders markdown as markup | `marked` stops being called, or the frame never parses |
| fits its box to the document when asked, and not otherwise | `fit` is ignored, or it fits to a number rather than to the document |
| comes back down when the document gets shorter | the root is measured instead of the body |
| does not shrink below the height it was given | `height` stops being the floor and one line collapses the panel |
| fills the width it was given | the width and border come off the iframe |
| carries the policy that makes it safe | the meta tag is dropped or weakened |
| refuses a script and an inline handler | the policy stops holding |
| renders nothing as nothing | `String(text)` starts printing the word `null` |

**The one that matters was checked by removing the policy**, and the result is
the reason the exhibit is worth having: the test did not merely notice a missing
meta tag, it reported

```
Expected THE SCRIPT RAN === the script did not run
```

— the script in the markdown actually executed. The CSP is the only thing
stopping it, and both the test and the page say so on sight.

## why there is no sandbox attribute

`sandbox=""` renders **nothing** in this nw.js build, silently — an empty box the
size you asked for, which reads as "there was nothing to show". Measured five
ways: plain `srcdoc` renders; adding `sandbox=""` blanks it; adding the CSP as
well blanks it; a `data:` URL instead blanks it; only
`sandbox="allow-same-origin"` rendered.

So the choice was never *sandbox or not* — it was which single restriction to
keep, and the CSP is the one that holds by itself. The sandbox was refusing the
code a second time.

What that costs is an opaque origin. It is survivable here **because scripts
cannot run**; it would not be if they could.

## two smaller things

- **The CSP goes in a template literal**, because the policy contains both kinds
  of quote. A policy that fails to parse fails *open* in the sense that matters:
  the browser drops a malformed CSP and renders the frame with no policy at all,
  which looks identical to a working one until the day the markdown contains a
  remote image.
- **Width and border are set by the plugin, not by a stylesheet.** An iframe with
  nothing said about it is 300px wide with an inset border, whatever box it is
  in — so a rendered document came out as a narrow column with a frame round it.
  A component that only lays out correctly under one particular stylesheet is not
  self-contained, and the theme is a slot you are expected to replace.

## it provides the frame and nothing else

The Rendered/Source toggle around it is the page's, because the buttons are the
theme's and the theme consumes nothing from here. A parse failure is **said
inside the frame** rather than thrown, because the source view beside it still
works and is what somebody would fall back to anyway.
