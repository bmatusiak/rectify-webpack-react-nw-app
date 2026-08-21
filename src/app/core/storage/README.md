# storage

Two stores over the browser's own storage.

| file | provides | consumes |
|---|---|---|
| `window.js` | `session`, `settings` | — |

`settings` sits on `localStorage` and survives the window closing. `session`
sits on `sessionStorage` and does not. They are the same factory otherwise,
which is why they are one plugin: neither can change without the other.

**A store is described by its defaults.** Every key you pass becomes a property
that reads through to storage and writes back on assignment — no get/set to
remember, nothing to serialise by hand:

```js
var prefs = imports.settings('demo', { page: 'system', density: 'roomy' });

prefs.page;              //'system' the first time, whatever was stored after
prefs.density = 'tight'; //saved, now
```

## two names worth knowing about

**It is `settings`, not `config`.** Every plugin's third setup argument is
already called `config` — that one is what `src/config.js` put there, this one
is what the user changed. Two different things by the same name in one function
is how you reach for the wrong one.

**Do not name a field `save`.** `save()` is the store's own writer, so a default
by that name cannot be defined without shadowing it. It is skipped — and it
**warns**, because skipping in silence is exactly how a checkout field called
`save` ended up handing react a function as `checked`, into a console nobody was
reading. `demo/window.test.js` is what found it.
