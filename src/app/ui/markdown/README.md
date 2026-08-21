# markdown

Markdown, rendered where it cannot do anything.

| file | provides | consumes |
|---|---|---|
| `window.js` | `markdown` | `react` |

```
markdown.Frame  <Frame text height />
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

## the tests

`window.test.js`, run inside the app. The frame is same-origin — there is no
sandbox attribute, deliberately — so a test can read what the browser made of the
document, which is the only way to check a policy that a browser has to enforce.

| test | what breaking it looks like |
|---|---|
| renders markdown as markup | `marked` stops being called, or the frame never parses |
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
