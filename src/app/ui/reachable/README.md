# ui/reachable

**What a tool can reach, on one screen.** The stance this build was made with,
the commands and MCP names a closed build will answer to, and the regions marked
open on the page you are looking at.

| file | provides | consumes |
|---|---|---|
| `window.js` | — | `react`, `theme`, `pages`, `may`, `Plugin` |

## why a screen and not just the marks

`core/may` draws a ring round a control a tool may use, which answers the
question *about that control, while you are looking at it*. The question people
actually have is **what can the thing driving my app touch**, and twenty pages of
controls cannot be audited by walking them.

It is also the half the marks cannot do at all. **A command has no pixels.** The
control socket and the MCP tools are reachable with nothing on screen, and before
this page there was nowhere they were written down.

## the four things it says

| | |
|---|---|
| **the stance** | open or closed. An open build says so in red, because in one the lists below are *not being consulted* and every control in the app is reachable |
| **over the control socket** | `N of M commands` — what `node src/cli.js` may call, out of everything registered |
| **over MCP** | tools, resources and prompts. Anything absent is absent from `tools/list` too |
| **marked on screen** | the `.is-open` regions in the page that is mounted, by name, with how many controls each holds |

**A name nothing registers is drawn in warning**, because that is the one kind of
drift a list of names invites: a command gets renamed, the entry stays, and the
config goes on promising something that no longer exists. The other direction
needs no help — a new command is closed until somebody lists it.

## nothing here is a copy

Every number comes from `core/may`, which got it from `src/stance.js` and
`src/config.js`. A page that re-derived *what is open* from the config would be a
second opinion, and the day the two disagree is the day this screen starts lying
about the one thing it exists to say.

The **regions** are the exception and have to be: they are in the markup of
whatever page is mounted, so main cannot know them. That is why the count is
worded as *where you are now* rather than as a total — a region on a page you
have not opened is not in it.

## why it is its own plugin

`core/may/window.js` says plainly why it will not draw this. It holds the
permission prompt, and a prompt that can be replaced along with the theme is not
a prompt — so it consumes no theme and builds its dialog out of plain DOM. A page
has no such duty and every reason to look like the rest of the app.

So it consumes `theme` and lives under `ui/`, which is where CLAUDE.md puts what
is on screen. **core does not consume ui; ui consumes core.**

**Deleting this leaves the stance enforced and nobody able to see it** — the same
trade `core/pages` makes about its own registry: the rule is core's and the
drawing is not.

## what it does not do

It does not let you change anything. There is no control on it, deliberately —
the stance was decided when the build was made and cannot be altered by anything
running, and the capability decisions belong to the **Guarded** page, which is
where taking one back lives. Two screens offering the same undo is two places for
the answer to be wrong.
