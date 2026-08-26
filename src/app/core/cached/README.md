# core/cached

**An answer somebody already worked out, and the rule for when it may be reused.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `cached` | `dataDir`, `log` |
| `server.js` | `cached` | `app` |

Plus `drawers.js`, which has no `provides`: the three doors, and everything that
makes them keep their promises.

```js
var graphs = cached.byContent('graphs');
var answer = await graphs.get(sha, function () { return expensive(); });
```

```
cached.byContent(name)          the key contains the thing itself
cached.byStamp(name)            the key is a file, stamped here
cached.whileFresh(name, ms)     the key is a clock, and it says so

cached.stale()                  something wrote -> drop the clock-keyed answers
cached.stats()                  hits, misses, shares, and what is in each drawer
cached.persists                 does any of this survive a restart
cached.forgetEverything()       throw the written ones away too
```

```
drawer.get(key, make)   the answer, worked out once
drawer.forget(key)      drawer.clear()      drawer.size
```

## the rule

> **Key on something that changes when the answer changes. Never on a clock.**

The app this came from arrived at this three separate times, in three different
subjects, and wrote it down each time — *"there is no window during which the
file is new and the answer is old"*.

## so there are three doors, not one

Which one a caller takes **says what its key is made of**. That is the point of
having three: a reader can see from the call which promise is being made, instead
of finding out from a stale panel.

| door | the key | written down |
|---|---|---|
| `byContent` | the thing itself — a sha, a hash | **yes** — it is true for ever |
| `byStamp` | a file's `mtimeMs:size`, stamped here | **never** |
| `whileFresh` | a clock, and the name admits it | no |

**`byStamp` stamps the file itself** rather than taking a key from the caller.
Leaving that to the call site is how two of them come to stamp the same file
differently and quietly keep two answers for it.

**Size is in the stamp** because mtime has a resolution, and two writes inside one
tick is the case it misses. `node.test.js` pins the mtime by hand to force that —
writing twice in a row usually lands in different milliseconds, so a stamp of
mtime alone passes the obvious test and is still wrong.

**A file that is not there has a stamp of its own.** *There is no such file* is a
perfectly good thing to remember, and it changes the moment somebody creates one.

## why the third door exists at all, given the rule it breaks

Sometimes checking whether the cached answer is still good **costs exactly what
the answer costs**, so there is nothing to key on that is cheaper than just
asking.

What is left is to make the window small enough that nothing can happen inside
it, and to close it by hand on any write. That is a de-duplicator wearing a
cache's clothes, and calling it **`whileFresh` rather than `cache`** is the only
way to keep the difference visible at the call site. The default window is a
second, not a minute: the only honest use is *no single draw asks twice*.

`stale()` is what makes it honest. **It leaves the other two alone**, and that is
the point rather than an oversight — a content-keyed answer cannot be wrong, and
a stamp-keyed one notices on its own the next time it is asked. Wiping those on
every write throws away exactly the answers that are still true.

## what may be written down, and what must not

Only `byContent`, decided by **one predicate** that every path asks.

It was decided in two places, and the second was dead — breaking it changed
nothing because the first already refused. A rule written twice is a rule where
one copy can be wrong with nothing noticing, and that is the copy somebody edits.
Its own sabotage found that by surviving.

**A stamp-keyed drawer must never reach disk.** What it holds is derived from a
file, and that file may be a sealed credential — a persisted copy of an unsealed
secret is a worse bug than every call this saves.

## the drawers live in main

The node half is rebuilt and re-run on every save. A cache kept there is emptied
by every edit — so during exactly the hours somebody is working on the app, it is
never warm and the thing it exists to avoid runs every time.

**And it costs nothing**, because in development main and the node half are the
same node process: reaching it is a function call, not a message. It is the same
argument [`ipc`](../ipc/) makes for keeping its handler table in main while the
handlers register into it from the half that reloads.

That claim breaks *silently* — move the drawers and everything still works, the
app is merely slow while you work on it — so `server.test.js` checks which half
is holding them, not just that a cache exists.

## with nowhere to write, it works anyway

This is the one plugin in `core/` that carries on where [`state`](../state/) and
[`secret`](../secret/) refuse, so the difference is worth stating.

Those refuse because state at a plausible wrong path is state the next start will
not find, and because a stand-in that quietly wrote cleartext looks exactly like
success. Both would be **wrong answers dressed as right ones**.

**A cache with nowhere to write is not a wrong answer, it is a cold cache.**
Every door still keeps its promise; `byContent` is still true for ever, it just
starts empty. Refusing would mean a plugin that merely *wants* to be fast cannot
load at all. `persists` says which, so nothing has to infer it.

## a counter cannot tell you it worked

`stats()` counts hits, misses and shares, and that is worth having — but the
worst cache failure this idea has had is invisible to it.

**A board in the app this came from cached correctly and saved nothing.** Building
the key cost four git processes per branch, and they ran on a *hit* as well as a
miss — so the heavy call really was skipped, the hit rate really was high, and the
timing never moved.

No counter in here could have caught that, because everything it measures was
healthy. What catches it is counting what the **caller** spawns, from outside.
**A drawer reporting 95% hits is not evidence that anything got faster.**

## the small ones

**Concurrent askers share one computation** — two callers wanting the same key at
the same moment is the ordinary case when a page draws, and without it the
expensive thing runs twice and both wait for their own copy.

**A computation that throws is not remembered.** Keeping a thrown error makes one
bad moment permanent, with no way for the caller to ask again.

**A full drawer drops the lot** rather than choosing a victim. Nothing here is
expensive to work out *once*, the bookkeeping an LRU needs is per-get rather than
per-evict, and a cache that needs a data structure to decide what to forget has
stopped being the cheap thing it was supposed to be.

**A drawer name is refused at the call that named it**, not at the write — it
becomes a file, and the throw belongs where the mistake is.
