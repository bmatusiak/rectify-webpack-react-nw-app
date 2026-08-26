# core/cron

**Everything the app does on a timer, in one place that can be looked at.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `cron` | `log`, `Plugin` |
| `server.js` | `cron` | `app` |

Plus `schedule.js`, which has no `provides`: the arithmetic, with no clock of its
own.

```js
//in a server.js -- safe to run again on every reload
cron.add({ name: 'sweep', every: 60000, about: 'tidy up what nobody claimed' });
self.own(cron.does('sweep', async function () { ... }));
```

```
cron.add({ name, every, about, running, firstRun })   describe it
cron.does(name, fn)   -> undo                          supply the work
cron.start(name)  cron.stop(name)  cron.forget(name)
cron.fire(name)       run it now, due or not
cron.list()  cron.get(name)   what has run, how long it took, what failed
```

## the point is the monitoring, not the scheduling

A `setInterval` is one line. What is hard is a repeating job that can say **when
it last ran, how long it took, and what the failure said** — because a timer
nobody can see is either working or has been silently dead for a week, and there
is no way to tell which.

So every job keeps its last twenty runs, with durations and failures, and
anything drawing a screen reads them from `list()`.

## `add` describes, `does` supplies

They are separate because **they have different lifetimes.**

The plugin that owns a job lives in the bundle that reloads, so it re-registers
every few minutes while somebody is working. The *description* — interval, what
it is for — is code, and the new bundle's version wins. The *record* is not code,
and a save must not touch it:

> **Re-adding a name keeps its history and its switch.** A save that reset
> `running` would silently switch a job off — or, worse, on.

`does` hands back the way to take the work off again, and it only removes its
own: a reload supplies the new work before the old half's teardown runs in some
orders, and an undo that did not check would delete the replacement.

## it lives in main

The node bundle is rebuilt every time a file is saved. A timer over there would
be torn down and rebuilt every few minutes — so **anything counting in hours
would never get there**, and the record of what has run would reset while
somebody was reading it.

Same argument that already puts the window, the tray, the [ipc](../ipc/) handler
table and [log](../log/) on that side.

## one timer for the whole app

Not one per job. The interesting question — *what is due* — is then answered in
one place against one clock, and a job registered while stopped needs no timer at
all.

**A one second beat is fine, and the arithmetic is why:** a beat compares a few
numbers and returns. The cost of a coarser one is that a job asking for fifteen
seconds gets fifteen and a bit, and nothing here needs better. `config.cron.beat`
if it ever does.

**The beat does not overlap itself.** It awaits each due job in turn, so a job
taking longer than a beat would otherwise have a second beat start on top of it.

## the details that took getting wrong

**The anchor is a fixed moment, not a reading of the current time.** This was
wrong first, and silently: `lastDueAt: null` meaning "start the clock now" was
re-evaluated on every check, so the job sat permanently one interval in the
future and **would never have run at all**. A job asking for one second was still
not due a second and a half later. Caught by a three-line sanity check before any
test existed.

**A new job waits out its first interval.** Counting from zero would make every
job in the app due the instant it registered, and they would all fire together on
the first beat. `firstRun: 'now'` is how a job asks for the opposite.

**Starting a stopped job means "from now", not "you are late."** One switched on
after being off for a day would otherwise fire immediately, which reads as broken
rather than as punctual.

**In flight is not due.** A run can take longer than its own interval whenever
anything is really happening, and a second copy started on top of the first is
how one slow job becomes a pile of them.

**A failing job is recorded and the clock keeps turning.** Throwing out of a beat
would take every other job in the app with it.

**The clock moves even when there is nothing to run.** A job whose work has not
been supplied yet — the bundle is mid-reload — must not become permanently
overdue and fire a burst the moment it arrives. It records `nothing to run yet`
instead.

## the server half refuses

Like [state](../state/) and unlike [log](../log/). A schedule that silently
accepted jobs and never ran them is the worst of the three possible behaviours:
the app looks scheduled, nothing happens, and there is no error anywhere to find.

`list()` still answers — with nothing, which is the truth.

## the tests

`schedule.js` takes `now` as an argument to everything, so **a job that runs
daily is as testable as one that runs every second** and `node.test.js` answers
in a millisecond. `main.test.js` checks the one thing pure tests cannot: that the
beat really turns — and it waits `BEAT * 3` rather than a fixed second, so tuning
the beat does not start failing the suite.
