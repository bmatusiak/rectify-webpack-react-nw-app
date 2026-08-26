# core/webStorage

Two stores over the browser's own storage. **Both of them are the person's, and
both are disposable.**

| file | provides | consumes |
|---|---|---|
| `window.js` | `session`, `preferences` | — |

`preferences` sits on `localStorage` and survives the window closing. `session`
sits on `sessionStorage` and does not. They are the same factory otherwise,
which is why they are one plugin: neither can change without the other.

**A store is described by its defaults.** Every key you pass becomes a property
that reads through to storage and writes back on assignment — no get/set to
remember, nothing to serialise by hand:

```js
var prefs = imports.preferences('demo', { page: 'system', density: 'roomy' });

prefs.page;              //'system' the first time, whatever was stored after
prefs.density = 'tight'; //saved, now
```

## what does not go in here

**Nothing the app would be upset to lose.** These are browser stores, so what is
in them belongs to whoever is sitting at the machine and disappears with their
browser profile — and **renaming the app in `package.json` is enough to do
that**, because nw picks its profile directory from the name. See
[core/dataDir](../dataDir/), which is where that trap is written down.

The app's own things — what it did, what it was told, anything authoritative —
belong on disk on the node side. That is what this is paired against:

| | owns it | lives in | gone when |
|---|---|---|---|
| `session` | the person | `sessionStorage` | the window closes |
| `preferences` | the person | `localStorage` | the browser profile is cleared, **or the app is renamed** |
| [`state`](../state/) | the app | `dataDir` on disk | you delete the folder |

## three names worth knowing about

**The folder is `webStorage` because that is what it wraps** — the Web Storage
API, `localStorage` plus `sessionStorage`. The old name was `storage`, which
said nothing about where anything lived and left "is this the app's or the
person's?" to be guessed.

**It is `preferences`, not `settings`.** It was `settings` until
[`state`](../state/) arrived, and then the two names both read as *app
configuration* — with the one that silently evaporates on a rename being the one
called `settings`. Somebody would eventually have put something authoritative in
it. `preferences` says whose it is.

**And not `config`.** Every plugin's third setup argument is already called
`config` — that one is what `src/config.js` put there, this one is what the user
changed. Two different things by the same name in one function is how you reach
for the wrong one.

## do not name a field `save`

`save()` is the store's own writer, so a default by that name cannot be defined
without shadowing it. It is skipped — and it **warns**, because skipping in
silence is exactly how a checkout field called `save` ended up handing react a
function as `checked`, into a console nobody was reading. `demo/window.test.js`
is what found it.
