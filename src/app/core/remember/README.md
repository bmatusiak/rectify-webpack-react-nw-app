# core/remember

**Where you were** — the page, the pane, the row you had picked.

| file | provides | consumes |
|---|---|---|
| `window.js` | `remember` | `preferences` |

Plus `remembering.js`, which has no `provides`: the rule, and the reading and
writing it guards.

```js
var [page, setPage] = remember.use('demo.ui', 'page', 'welcome');
//a useState that survives a restart -- same shape on purpose
```

```
remember.read(area, key, fallback)     the fallback if there is nothing, or storage threw
remember.write(area, key, value)       -> true if it kept it, false if it refused
remember.refuses(value)                a sentence, or null -- askable BEFORE you decide to keep
```

## the whole rule

> **Only where somebody was looking. Never what they were looking at.**

A page name, a pane name, the *name* of the row that was selected, a filter that
was ticked. That is a property of this window and of nothing else.

**Never** a token, a key, a password, anything typed into a guarded field, or
the contents of anything the app read. Not because this store is especially
leaky, but because browser storage is the wrong **shape** for a secret: readable
by anything running in the page, kept in a profile directory nobody thinks of as
sensitive, and copied around by whatever syncs profiles. Something worth keeping
goes to [`secret`](../secret/), on the node side.

## the checks are not the rule

Two halves of it can be seen by a machine, and `write` refuses both: a value
that [`looks like a credential`](../log/looks-like.js), and a value longer than
4 KB — which is what somebody was looking **at** rather than where they were
looking.

**Neither is the rule, and pretending otherwise would be worse than not
checking.** A field that is short, plain and still secret gets through. The
sentence above is the rule; these two stop the cases that have a shape.

The app this came from states the rule in a header and enforces nothing, so the
first person to keep a token here would find out from a support bundle.

## why it is not `session`

`sessionStorage` survives a reload and **dies with the window** — and the window
dying is precisely the case this exists to survive. Every change to `src/main.js`
or `webpack.config.js` needs a restart, and a packaged app gets one on every
launch. The cost is not the four seconds; it is finding your place again.

The demo kept its open page in `session` for exactly that reason — a reload was
the only thing it had to beat — and a restart still opened on page one. It uses
this now, which is why [`window.test.js`](window.test.js) reads the raw item out
of `localStorage` rather than trusting the service: **the store is named in two
places**, `consumes` and the line that builds the service, so the two can drift.
A drift there works all day and has forgotten everything by morning.

## why it names one key at a time

[`webStorage`](../webStorage/) builds its object by defining a property **per
key it was given a default for**. So a store asked for with `{}` has no
properties at all, and every read comes back `undefined` however much is sitting
in storage underneath — a store that saves faithfully and cannot load, which
from the outside reads as *nothing was ever saved*.

`remembering.js` names the key as its own default on every call, which is also
the documented shape: the getter reads storage, so a value already there wins,
and the default is written only when there is nothing.

That bug is [`node.test.js`](node.test.js)'s first test, and its fake store is
faithful to `webStorage`'s real shape on purpose — a convenient fake backed by a
plain object would pass and prove nothing.

## a refusal answers, and does not throw

`write` returns `false` and says why through `console.warn`. It does not throw,
because a window that will not open because it could not remember which tab was
showing is a poor trade for the convenience — and storage genuinely does throw,
in private mode and on a full disk.

`use` moves the react state either way, so a pane behaves exactly as it would
have with `useState` and only the memory is lost.

**`console.warn` and not [`log`](../log/).** The log lives on the node side and
this is a window plugin with no socket; taking `io` to report a refused write
would make remembering which page you were on depend on the connection being up,
which is the one thing it must not do.
