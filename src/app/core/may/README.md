# core/may

**What this app is allowed to do, and who said so.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `may` | `state`, `log`, `ipc`, `bridge` |
| `server.js` | `may` | `app` |
| `window.js` | `may` | `io` |

Plus `deciding.js`, which has no `provides`: what an answer means and who may
give one.

```js
may.declare('serve', { about: 'Let a browser be a client of this app.' });

var said = await may('serve', { from: from });   //-> { allowed } | { allowed: false, why }
```

```
may.asks(name)        is this guarded -- sync, for painting
may.decisions()       what a person has decided, and what the code said it was for
may.decide(name, answer, from)   WINDOW ONLY
may.forget(name, from)           WINDOW ONLY -- back to nobody having said
may.ANSWERS           once, run, always, never

may.stance            'open' | 'closed' -- decided when the build was made
may.closed()          the same, in the window, read off BUILD_OPEN
may.reaches(kind, name)   null, or why a closed build does not reach it
may.stale(kind, present)  listed names that nothing registers any more
may.reach()           the whole inventory, for a screen
```

In the window, `may` takes the **event** rather than a `from`, because the event
is where the browser keeps its own word for whether a person did it:

```js
var said = await may('serve', event);   //reads event.isTrusted before anything is awaited
may.onChange(fn)                        //-> unsubscribe. repaint when a decision moves
may.answered('serve')                   //the answer already given, or null
may.undecided()                         //guarded things nobody has answered yet
```

`answered` is how a page says *allowed always* beside a control instead of only
that it is guarded. `undecided` is how anything finds out whether a question
would even be raised **without raising one** — its own suite needs that: a test
that wants to see the dialog has to pick something that still asks, and naming
one in the source meant the day somebody answered it, the test quietly asserted
a question about a thing that no longer asks.

```sh
node src/cli.js may       # what is guarded and what has been decided
```

## the question is for everything that is not a person

**A person pressing a guarded control is not asked anything.** They are sitting
there and they meant it — and a dialog confirming what somebody just did is the
kind people learn to click through without reading.

**The dialog is for the command line, an MCP tool, a model driving the window.**
That is what a guarded control is *for*: not to slow a person down, but to give
an outside caller a way to **ask** rather than either being refused outright or
helping itself.

So the lock does not mean *you need permission*. It means **something outside has
to ask about this one**, and it tells a person what the control is protected
from.

`event.isTrusted` is what tells them apart, and a page cannot forge it.

| who | what happens |
|---|---|
| a person presses it | it happens |
| the cli, a tool, a model | a question goes up in the window |
| that same caller answering the question | ignored — only a person may allow |
| that same caller pressing **Not now** | allowed. Refusing can only make the app do less |

**Anything may say no**, and it has to: a dialog only a person can dismiss is one
that sits over the app until somebody comes back, with a driven run wedged on it
and the thing it asked about not happening either way.

## the code proposes and a person decides

A plugin says `may.declare('serve')` — that is the app's opinion that opening a
port is somebody's decision to make — and it stands until a person answers.
Nothing here decides anything on its own.

**A decision can be taken back.** `always` without `forget` is a one-way door,
which makes the easy answer the dangerous one and teaches people never to pick
it. Forgetting is not refusing: it puts the capability back to nobody having
said, so the next outside caller asks.

**Answers have scope**: `once`, `run`, `always`, `never`. Only `always` and
`never` are written down; `run` lives in main's memory and dies with the process,
which is the whole of what it promises; `once` is never stored, because storing
it is a contradiction.

The app this idea came from has two states — guarded or not — and asks every
time. The only way to stop being asked is to stop being guarded, permanently,
which is how a guard gets turned off for a reason that lasted ten minutes.

## it guards a capability, not a control

This is the difference from [dashboard-beta's `guards`](../../../), and it is the
whole reason this is a rewrite rather than a port.

Over there a guard is keyed on **the words on a button**, and enforcement is the
driver declining to press a purple one. Their own file names the hole: *"a
control outside the kit is a control the guard cannot see"* — so a plain
`<button>`, a renamed label, or anything calling the action directly walks past
it.

**Here the doing goes through `may`.** A control outside the theme can only fail
to *look* guarded; it cannot do the thing. That failure is the safe way round,
and theirs is the other one.

## three facts do the enforcing

None of them rely on a caller behaving.

| | |
|---|---|
| **provenance** | [`ipc`](../ipc/) hands every handler a second argument saying whether the call came over the wire. It is an argument and not a field on the data, because the data belongs to whoever sent it |
| **`event.isTrusted`** | the browser's own flag, `false` for everything javascript dispatches — which is what [`remote/window.js`](../../remote/window.js) builds to drive this app. A page cannot forge it |
| **the gate is the capability** | the registry lives in main and the doing goes through it |

**There is exactly one path to a yes**, and everything else falls past it.
Written the other way round — refuse the cases you can name, allow the rest — an
empty `{}` got through: a caller that said nothing about where it came from was
treated as a person at the window. Its own test found that.

## read from anywhere, set from nowhere but the window

> *A guard the command line can remove is not a guard. It is a comment, one call
> away from nothing — and every refusal downstream of it becomes a refusal you
> have to trust a model not to have unlocked first.*

That sentence is theirs and it is the best idea in their design. `node src/cli.js
may '{"decide":"markup","answer":"always"}'` is refused, and the refusal says
where to go instead.

## it fails shut

An unreadable decisions document means **every declared guard stands and none of
the person's exceptions do**. A row with an answer nobody understands poisons the
whole file rather than being skipped — skipping it would quietly drop a `never`
somebody had set, which is the one direction this must never fail in.

The wrong answer in that direction costs somebody a press. The wrong answer in
the other is something nobody agreed to.

## why it lives in main

The node half is rebuilt on every save, so answers kept there would be forgotten
by every edit — and *"for this run"* would mean *"until you next press ctrl-s"*.

**And the window cannot own what guards the window.** The thing being driven is
not the thing to ask whether a drive is allowed. The prompt goes out over
[`bridge`](../bridge/), which is main's own wire to the page and carries acks.

## what it does not protect against

**A shell.** Anything that can run `node` in this folder can edit the code that
calls `may` at all.

What it protects is the app's own surface — the control socket, the MCP tools,
the driven window — from being used to do things nobody agreed to, which is the
realistic case now that a model can reach all three.

## what is guarded here

`serve`, because it opens a port on this machine, and `markup`, because it writes
whatever is on the screen to a file.

**A launch flag is consent.** `npm start -- --serve` is a person typing it, and
the tray is a native menu nothing that drives this app can reach — so only the
runtime path over ipc asks.

## the mark

A **lock and a dashed ring**, painted from this registry by
[`ui/theme`](../../ui/theme/) so the mark and the refusal are one fact: a control
cannot be drawn as guarded without being guarded, or guarded without saying so.

**It is a shape and not a hue** because this app ships 28 swatches it does not
own, and five already spend a purple — `cosmo` and `materia` on `info`, `pulse`
on `primary`, `simplex` on `danger`, and `vapor`'s `primary` is `#6f42c1`, the
exact colour there would be to reserve. Measured, not assumed.

`--bs-guarded` is still the colour's name, and it colours the ring and the glyph.
A ring is not a field of colour, so a swatch that also spends purple does not
collide with it — which is what makes one token enough for all 28, with no
per-swatch table to keep in step.

## the other half: what this build reaches at all

Everything above is a **deny list**. A capability is named, a person decides, and
everything nobody named is reachable. That is the right shape for a development
build — it is how this app is driven and tested — and the wrong one to ship.

The app's own files already argue against deny lists. `core/log`, `core/events`
and `profile.js` each land on some version of *a deny list is a list somebody has
to have got right*. And it was not theoretical here: measured on this app's own
demo, `node src/cli.js read "#f-plain"` handed back `hunter2` from an unguarded
password field, with no dialog and no record. Not a bug in the guard — the
guard's premise.

So there is a second, coarser answer underneath it.

| | deny (`declare` / `may()`) | allow (the stance) |
|---|---|---|
| unit | a named capability | the whole build |
| decided by | a person, at the window, at the time | whoever made the build |
| when nobody has said | it asks | it refuses |
| can it be changed while running | yes — `once`, `run`, `always`, `never` | **no** |

### it is decided when the build is made

`src/stance.js` answers it and it becomes the `BUILD_OPEN` constant, exactly the
way `canServe` does — because **the thing being shut off is the runtime**. A
stance the command line can turn off is `guardSet --off` by another name, which
is the move `deciding.js` exists to make impossible. Webpack folds the open
branches out, so there is nothing left to flip.

Absent from `package.json` means **open in development, closed when packaged**.
`"app": { "open": true }` makes a debug package; `"app": { "open": false }` closes
a development build, which is how the closed stance gets worked on in a restart
rather than a three-minute `dist`.

### closed refuses flat and never prompts

That is the whole difference from the deny half. `once` / `run` / `always` are
for a capability somebody weighs up; a default-deny that raised a dialog for
hundreds of controls would be answered `always` to everything inside a week — and
then it would be a deny list again, with extra steps.

In a closed build the only way in is that somebody listed it before shipping:

```js
//src/config.js
may: { open: { commands: [...], tools: [], resources: [], prompts: [] } }
```

`may` is on the shipped list on purpose. Reading what a build allows was never
the risk, and a person at a terminal who cannot ask has to take the app's word
for it.

### `stance.js` is a module for the reason four others are

Two stances means two behaviours, and the one nobody runs rots. That is this
codebase's most-repeated finding — `bridge/isTop.js`, `ipc/token.js`,
`dataDir/places.js`, `ui/theme/isDark.js` and `deciding.js#personDid` were all
moved out after their own sabotage survived, because nothing on one machine could
reach the branch.

So the stance is **handed in** rather than read off the world, and `node.test.js`
asks both branches in a millisecond with no build, no window and no package.

### what enforces it, and where

| | |
|---|---|
| `core/ipc` | a wire call to an unlisted command is refused. `commands` answers only the open ones, and an unlisted name and a nonexistent one get the **same sentence**, so the surface cannot be guessed at. The gate is a hook `ipc` holds and this plugin installs — `may` consumes `ipc`, so it cannot be the other way round |
| `remote` | `click` and `fill` refuse outside a `.is-open` region; `read` answers what an element **is** and withholds `value` and `checked` |
| `app_plugins/mcp` | a tool that is not listed is not in `tools/list` at all, and calling it by name answers exactly what a tool nobody registered does |
| `ui/theme` | `Reachable` and `open=` draw the mark, **only in a closed build** |
| `ui/reachable` | the one screen that says what all of the above adds up to |

**The stance is asked before the guard** in `remote`. Both orders are equally
safe — either refuses — but a guarded control a closed build was never going to
reach would otherwise put a dialog on somebody's screen about a press that is
already decided. What it must not become is *reachable therefore allowed*: an
open region says the driver may touch this, not that a capability inside it
stopped being somebody's to allow.

### the door is shut twice, and only one half has pixels

| | decides | lives in |
|---|---|---|
| the open list | which **commands** answer at all | `src/config.js` |
| the marks | which **controls** the driver may touch | `Reachable` / `open=` in the markup |

A package ships with `commands`, `health`, `may` and `quit` and nothing else. The
four driver commands are behind the `BUILD_DRIVEABLE` constant, so a normal
`npm run dist` does not contain the names — measured by building both ways and
grepping `dist/`.

**Which makes the second half untestable in a shipped build, and that is what
`APP_DRIVEABLE=1` is for.** The marks are the layer that does the protecting, and
with nothing able to reach the page `drive` can only prove the lock works. A
build made to be checked is safer than a default somebody can walk through: the
flag is build-time, folded out, and cannot be turned on by anything running.

`quit` is on the shipped list deliberately. It reads nothing, writes nothing and
acts on nothing — and a package writes no instance file, so with `quit` refused
there is no clean way to stop one from a terminal at all. What people do then is
kill by image name, which is exactly what CLAUDE.md says never to do and for a
reason that happened here.
