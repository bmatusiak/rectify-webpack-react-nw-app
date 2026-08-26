# core/state

**The app's own things, kept between restarts.** The node-side half of a pair.

| file | provides | consumes |
|---|---|---|
| `main.js` | `state` | `dataDir` |
| `server.js` | `state` | `app` |

Plus `names.js`, which has no `provides`: what may become a file or a folder.

```js
var kept = state.doc('viewer');

kept.read({ port: 0 });        //the fallback when there is nothing yet
kept.write({ port: 8080 });    //atomic: written beside, moved into place
kept.forget();                 //stop existing, rather than become {}
```

```
state.where     the directory
state.names()   what documents are kept
```

```js
state.here.doc('tasks')   //the same, but about whatever the app has open
state.here.open           //is there one at all
state.here.name           //which, or null
state.here.where          //its directory, or null

state.follow(fn)          //the app says which namespace -> the undo
state.slug(anything)      //a name a namespace may be called
```

## two drawers, and which one a thing goes in is the whole design

| | |
|---|---|
| `state.doc(x)` | true whatever the app has open — its settings, the list of namespaces, **which one is open** |
| `state.here.doc(x)` | about the one that is open, and out of view when a different one is |

**Folding them together is not untidiness, it is contamination**: point the app
at a second workspace and the first one's things are still there, answering,
about something that is not in front of you.

**`here` is nothing when nothing is open** — not a default drawer. A window about
nowhere must not be shown the contents of somewhere, and a write with nowhere to
go is *refused*, because "saved" and "there was nowhere to save it" are different
answers. Ask `state.here.open` first if a caller can be in either position.

## the app says where it is, and core never learns what a namespace is

```js
var undo = state.follow(function () { return whicheverIsOpen; });
```

**This cannot consume the plugin that knows.** *Which* namespace is open is
itself a thing to keep, and one that must survive the switch — so it belongs in
the app's own drawer, which is here. A plugin keeping it in `state` while `state`
asked that plugin where we are would leave the two waiting on each other.

So the direction is inverted: the app hands its answer in. Same shape as
[`log`](../log/)'s `keeper`, which is the other place core takes a policy from
outside rather than naming it.

**One slot, not a list.** Two things claiming to know where we are is the
disagreement this whole idea is against, so a second `follow` replaces the first.

**Resolved on every call**, which is what makes a switch automatic: nothing
subscribes, nothing reloads, and there is no moment where one part of the app is
still answering about the namespace before last.

## a namespace is a name, not a path

It becomes a directory that everything the namespace keeps then lives inside, so
it is refused rather than sanitised — a whole drawer escaping is worse than one
document doing it.

An app whose namespaces are folders calls `state.slug(path)` first, which is a
readable part **and a sum over the whole string**. Two folders both called
`website` on different disks is the ordinary case, and a slug of the last part
alone would put both in one drawer — the contamination this exists to stop,
arriving through the door meant to prevent it.

`slug` is exposed rather than kept private because the alternative is every such
app writing its own, and two of them would disagree about the hash — which shows
up as a namespace losing everything it had, the day somebody refactored.

## and it is not a profile

| | changes | decided | what survives it |
|---|---|---|---|
| [**profile**](../dataDir/) | the **root** | once, at boot | nothing |
| **namespace** | a **drawer** | at runtime, repeatedly | the app's own drawer |

`--profile=test` is *leave my real data alone*. A namespace is *I have three of
these open*. Neither is expressible as the other.

## the pair, and which half you want

The scaffold had no answer on this side at all. [webStorage](../webStorage/)
gives the window `session` and `preferences`; a `server.js` had **nowhere to put
anything** — which is exactly why [lifecycle](../lifecycle/) invented an instance
file and [ipc](../ipc/) invented a token path.

| | owns it | lives in | gone when |
|---|---|---|---|
| `session` | the person | `sessionStorage` | the window closes |
| `preferences` | the person | `localStorage` | the profile is cleared, or the app is renamed |
| **`state`** | **the app** | [`dataDir`](../dataDir/) | you delete the folder |

**The difference is ownership, not durability**, and getting it wrong is
one-directional. A preference kept here is merely in an odd place. Something
authoritative kept in the browser is one rename away from gone.

## a document, not a key-value store

`doc('x')` is a whole JSON file read and written at once, because that is the
unit a restart has to be atomic in: half of a settings file is not half a
setting, it is a file that will not parse.

**Written beside and moved into place.** Writing straight over the real file
leaves a window in which it is half a document — and a reader that opens it then
does not get an error, it gets the **fallback**, which every call site treats as
*"nothing kept yet"*. Losing everything to a flicker mid-write is a silent, total
loss that reads as a fresh install.

**A missing file and an unreadable one both answer the fallback.** Neither is
recoverable here and both mean *there is nothing to go on* — the difference is
worth a line in a log, not a decision at every call site.

**A byte-order mark is stripped.** It is what a file picks up from being opened
in an editor on Windows, and `JSON.parse` refuses it — which reads as corruption
rather than as a BOM.

**`forget()` is for a thing that should stop existing** rather than become `{}`.
An empty document and no document are different answers, and only one of them
means *this was never set up*.

## a name is a refusal, not a sanitiser

Letters, digits and dashes. Quietly turning `../../etc/passwd` into `etcpasswd`
would write a file somewhere surprising and say nothing; a name that is not a
name is a caller bug, and it should be one at the call that made it.

## why the second drawer is here, when it was not going to be

This README used to say **no scopes**, on the grounds that a scaffold with no
concept of a workspace would be shipping a hole — a second drawer with nothing
to put in it, and an app that needed one could add it on top.

**The hole was in the other direction.** `state`, [`secret`](../secret/), and
everything else that keeps anything all root under [`dataDir`](../dataDir/), so
an app adding namespacing "on top of this" would have had to add it to each of
them separately. Four plugins, four notions of *where am I*, and nothing holding
them in step — which is the same argument that put the directory itself in one
plugin rather than in the three that wanted it.

So core carries the mechanism and knows nothing about what a namespace *is*.
`follow` is the whole of the app's side of it.

## it does not work out where it lives

[`dataDir`](../dataDir/) does, once, and this puts things in it. The paths are
resolved **lazily** — `dataDir`'s server half refuses when there is no main half
behind it, so asking at setup time would turn *"this half cannot store things"*
into *"this half will not load"*.

`server.js` refuses for the same reason `dataDir` does: state written to a
plausible wrong path is state the next start will not find. That is the opposite
call from [log](../log/), which carries on — losing a log line costs a line,
losing state costs whatever the app was told.
