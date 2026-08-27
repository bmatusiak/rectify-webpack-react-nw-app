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
may.ANSWERS           once, run, always, never
```

In the window, `may` takes the **event** rather than a `from`, because the event
is where the browser keeps its own word for whether a person did it:

```js
var said = await may('serve', event);   //reads event.isTrusted before anything is awaited
may.onChange(fn)                        //-> unsubscribe. repaint when a decision moves
```

```sh
node src/cli.js may       # what is guarded and what has been decided
```

## the code proposes and a person decides

A plugin says `may.declare('serve')` — that is the app's opinion that opening a
port is somebody's decision to make — and it stands until a person answers.
Nothing here decides anything on its own.

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
