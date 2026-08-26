# core/log

**One live log, tagged, that everything writes into.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `log` | — |
| `server.js` | `log` | `app` |

Plus `looks-like.js`, which has no `provides`: what a secret looks like.

```js
var say = log.on('build');       //a logger with its tags already on it

say.info('rebuilding');
say.bad('it threw');
say.out(stderr);                 //multi-line, split so each line filters alone
say.on('webpack').warn('slow');  //narrower still
```

```
log.since(id)     everything after an id
log.tags()        every tag in the log now, with how many carry it
log.subscribe(fn) -> unsubscribe
log.all()  log.clear()  log.keeper(fn)
```

## tags, not levels

The question a person actually asks is *"what happened with the build"* or
*"what did ipc do"* — and that is a **filter**, not a place to go looking. Every
line carries where it came from, so this is one stream you narrow rather than
several you correlate.

Levels are still there (`info` `good` `warn` `bad` `out`) but they are a second
axis, not the organising one.

## it lives in main, and that is the point

The node half is rebuilt and re-run **every time a file is saved**. A log kept
there is emptied several times a minute during ordinary development — so *"what
happened just before that broke?"* is unanswerable exactly when it is being
asked.

`main.js` is loaded once and never reloads, so the log survives the saves. Same
argument that already puts the window, the tray and the [ipc](../ipc/) handler
table on that side. `server.js` holds nothing: it takes the real one off the
host and writes into it.

## it is in memory, and the reason is credentials

`out()` exists to take command output, and command output carries tokens,
sign-in urls and whatever a subprocess decided to print. **Writing this stream to
a file would put all of that on disk in cleartext**, in a file nothing treats as
a secret.

So the cost is accepted and it is real: a restart loses the record. A durable
record is not an append call added to `main.js` — it needs redaction at the
boundary and a decision about where it lives. `log.keeper(fn)` is the one seam it
may arrive through.

## a credential is never a line, whatever printed it

Redaction happens **on the way in**, not on the way out. Anything drawing this,
photographing it, or handing it to the terminal would otherwise each have to
remember — three places to be right instead of one.

`looks-like.js` is a file of its own for a measured reason. The app this came
from kept its patterns in the logger, four more in its event store, and nine in
the app *it* was ported from, with no two agreeing — one rule taught separately
in three places. What that cost was **a github token the logger did not redact at
all**, sitting in a log somebody was reading.

**When [`core/secret`](../secret/) is ported, this file moves there** and `log`
consumes it. That plugin is where a secret is kept, so it is where *what one
looks like* belongs. Until then this is the one copy, and adding a second
anywhere is that bug starting again.

**Narrow on purpose, and that is the hard part.** The blunt rules — anything long
and random, the tail of every url — would redact commit hashes, base64 and ids,
which is most of what makes a log worth reading. A redactor that eats the log is
one somebody turns off. Every shape in the list is one that cannot plausibly be
anything else.

**And it is the second line of defence.** What must not be in a log must not be
sent to one. This exists because *must not* is a rule somebody has to be right
about every single time.

## what this is not

**Not `nw.log`.** That file is everything chromium and node printed, noise
included, and `npm run log` reads it from *outside* the app. This is what the app
deliberately recorded, tagged and filterable, from inside.

They are not rivals: every line here is mirrored to the console, so it reaches
`nw.log` too. A line that exists only in memory is one a crash takes with it —
and a crash is when somebody wants it most.

## an id from a log that no longer exists

Ids count from 1 and reset when the log does, because it is in memory and is
about what is happening *now*. So a watcher that reconnects afterwards asks for
*"everything after 412"* of a log whose newest line is 3 — and being answered
with nothing, for ever, looks exactly like a quiet system: connected, healthy,
never printing another line.

An id higher than anything held cannot be one of ours, so `since` reads it as
**start again** rather than as a filter. That is the honest answer, since the log
did just begin.
