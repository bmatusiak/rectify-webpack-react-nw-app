# core/dataDir

**Where this app's data lives on disk**, worked out once.

| file | provides | consumes |
|---|---|---|
| `main.js` | `dataDir` | `app` |
| `server.js` | `dataDir` | `app` |

```
dataDir.path            the directory
dataDir.from            the package name it was derived from
dataDir.at(...parts)    a path inside it
dataDir.ensure(...parts)  the same, and the directory exists afterwards
```

```
windows     %LOCALAPPDATA%\<name>\
elsewhere   ~/.config/<name>/
```

## renaming the app moves its data, silently

`<name>` is `name` in `package.json`. nw.js picks its own profile directory from
that string, and everything wanting somewhere to put something has followed it
there. Change it and the next launch looks in a directory that does not exist,
finds nothing, and behaves exactly as though this were a first run.

**Nothing announces it.** It reads as *"the app forgot my settings"*, which
sends somebody looking in the wrong place entirely. Three things in this
scaffold already move with that name and none of them say so:

| | what happens |
|---|---|
| the control socket | [ipc](../ipc/) builds the pipe name from it, so `node src/cli.js` stops finding the app |
| the ipc token | the same, in the temp directory — a renamed app cannot authenticate against a running old one |
| the nw profile | `localStorage` goes with it, so [webStorage](../webStorage/)'s `preferences` come back empty |

That is **three derivations of one fact**. Two is already how a rename becomes a
mystery in one place and not the other; the fourth plugin to work it out again
is a bug waiting for somebody. This is the fourth one, made once.

## the server half refuses rather than guessing

`main.js` works the path out; `server.js` takes it off the host, handed over by
[core/build](../build/). With no main half behind it — which
`test/server-graph.test.js` builds deliberately — it **refuses**, in a sentence
that says why.

**A stand-in returning a temp folder would be worse than an error**, in the way
that matters here: whatever gets written lands somewhere plausible that nobody
will think to look in, or to delete.

**And it refuses across the whole surface**, not just `at()`. A stand-in narrower
than the thing it stands in for answers `undefined` where it meant to refuse, and
`path.join(undefined, 'x')` throws a `TypeError` about an argument — from a line
that looks like it is about a file, with the explanation never said.

That is also why callers should resolve paths **lazily**. Asking at setup time
turns a plugin that merely *can* store something into one that cannot load at
all.

## what belongs in it

Things the node side owns and the page may not reach.

**Not** where somebody was looking, what they had selected, or which swatch they
picked — that is the browser's, and [webStorage](../webStorage/) is where it
goes. The difference is who owns it and what destroys it:

| | owns it | gone when |
|---|---|---|
| `dataDir` | the app | you delete the folder |
| `webStorage` | the person | their browser profile is cleared, or the app is renamed |

## `ensure` is separate from `at` on purpose

Reading a path should not create a directory. `dataDir.at('x')` in a log line
would otherwise leave a folder behind as a side effect of describing one — so
`at` is pure and `ensure` is the one that makes it.

Without `ensure`, every plugin that writes a file carries the same
`mkdirSync(..., { recursive: true })`, and the one that forgets does not fail at
boot — it fails the first time somebody saves something.
