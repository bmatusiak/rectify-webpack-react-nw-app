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
dataDir.profile         which set of data this run works on, or null
dataDir.root            the app's directory whatever profile is on
dataDir.profiles()      what sets of data exist
```

```
windows     %LOCALAPPDATA%\<name>\
elsewhere   ~/.config/<name>/
```

## a profile gives a run its own world

```sh
npm start -- --profile=test    # leave my real data alone
npm start -- --no-profile      # the app's own, whatever the manifest says
```

`"app": { "profile": "demo" }` in `package.json` is the other way to say it, and
the flag wins — the same shape as [`serve`](../../../serve.js), for the same
reason. [`src/profile.js`](../../../profile.js) decides it.

**Everything follows without one plugin knowing the feature exists**, because
[`state`](../state/), [`secret`](../secret/) and anything else that keeps
something all root under this. Moving this moves them.

| | |
|---|---|
| no profile | `%LOCALAPPDATA%\<name>\` — exactly where it always was |
| `--profile=test` | `%LOCALAPPDATA%\<name>\.profiles\test\` |

**The default does not move**, which is the difference between a feature and a
migration: adding profiles relocated nothing that was already on disk.

The container is dot-prefixed so it cannot collide with a drawer an app asks for
by name — `dataDir.at('profiles')` is a perfectly reasonable thing to want.

**A name that is not a name stops the launch.** [`serve`](../../../serve.js)
complains and falls back, because the cost of getting that wrong is a port
nobody wanted. Here the cost is that the run which *asked* to be kept apart
writes into the real data instead — so a mistyped `--profile` refuses rather
than quietly becoming *no profile*.

## a profile is not a namespace

They get confused because both are "keeping things apart", and building one when
you wanted the other is expensive to undo.

| | changes | decided | what survives it |
|---|---|---|---|
| **profile** | the **root** | once, at boot | nothing — that is the point |
| **namespace** | a **drawer** | at runtime, repeatedly | the list of them, and which is open |

A process cannot be halfway between two data directories, which is why a profile
is settled before anything opens. A namespace has to be switchable while the app
runs, and the things that must survive the switch cannot live inside it — see
[`state`](../state/)'s `here`.

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
