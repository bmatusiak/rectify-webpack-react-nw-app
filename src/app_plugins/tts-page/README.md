# tts-page

A **page in a tree the app has never heard of** — the Speech page in the
sidebar, registered from `src/app_plugins`.

| file | provides | consumes |
|---|---|---|
| `window.js` | — | `pages`, `theme`, `tts`, `Plugin` |

Provides nothing. It exists to be the proof that
[core/pages](../../app/core/pages/) works: nothing in `src/app` knows this
plugin is here, nothing was edited to make room for it, and deleting
`src/app_plugins` takes the page away without leaving a gap.

## why it is not part of tts

A page is a composition of the theme kit, so it consumes `theme` — and
[tts](../tts/) must not. A scaffold with the theme deleted would otherwise lose
the ability to **speak** because it lost the ability to **draw**, and speaking
from a headless build or from the terminal is most of the reason that service
has a node half at all.

Same cut as [mcp](../mcp/) and [mcp-example](../mcp-example/): the capability,
and the thing that shows it off, are different plugins so that the second one is
deletable.

## it is also where the click comes from

Chromium will not speak in a page nobody has touched — the autoplay policy,
since speech is audio — so [tts](../tts/) hands the sentence to the node half
and says why. **Pressing Speak is the user activation**, which is the only way
to make the in-page route work at all.

The two buttons beside it ask for a route by name. On a machine with voices the
page never falls back on its own, so the half that matters on a bare linux box
would otherwise be the half nobody ever runs — and "What answered" says which
one did, so the difference stays visible rather than becoming folklore.

## what the shell gives it

`open(id)` and `toast(message, opts)`, and nothing else — see
[core/pages](../../app/core/pages/). Everything else this page needs it gets
from its own plugin's imports, which is the cut that makes a third-party page
possible: the registry does not have to know what a page might want.

`toast` is treated as optional here, because a shell that is not the demo's may
not have one.
