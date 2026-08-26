# core/state

**The app's own things, kept between restarts.** The node-side half of a pair.

| file | provides | consumes |
|---|---|---|
| `main.js` | `state` | `dataDir` |
| `server.js` | `state` | `app` |

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

## what it deliberately does not have

**No scopes.** The app this came from has a second drawer — state about whichever
workspace is currently open — and a rule that folding the two together is not
untidiness but **contamination**: point the app at a second workspace and the
first one's tasks are still there, answering, about things that are not in front
of you.

That is a real and hard-won lesson about a concept this scaffold does not have.
Shipping an empty second drawer would be shipping a hole. An app that needs one
adds it on top of this.

## it does not work out where it lives

[`dataDir`](../dataDir/) does, once, and this puts things in it. The paths are
resolved **lazily** — `dataDir`'s server half refuses when there is no main half
behind it, so asking at setup time would turn *"this half cannot store things"*
into *"this half will not load"*.

`server.js` refuses for the same reason `dataDir` does: state written to a
plausible wrong path is state the next start will not find. That is the opposite
call from [log](../log/), which carries on — losing a log line costs a line,
losing state costs whatever the app was told.
