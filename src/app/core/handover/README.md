# core/handover

**A box core carries without looking inside** — what a plugin hands to its own
other half, across a reload.

| file | provides | consumes |
|---|---|---|
| `main.js` | `handover` | — |

```js
//any plugin's main.js -- core never hears this name
handover.put('myThing', thing);

//its own server.js, after every reload
var thing = app.host.of('myThing');
```

```
handover.put(name, value)   once, and it throws on a second claim
handover.get(name)          undefined for a name nobody put
handover.names()            what is being carried
```

## the coupling this removes

The node bundle is rebuilt **every time a file is saved**, so anything a plugin
must not forget lives in its `main.js` and reaches its `server.js` through the
host. [core/build](../build/) is what carries that host — and it names every
service it carries, one by one, in its `consumes`.

For core naming core that is right. Hiding `http` or `io` behind a lookup would
make the host harder to read for nothing.

**But it meant an app plugin could not cross that line without editing core.** A
plugin in [`src/app_plugins`](../../../app_plugins/) with something to keep
across a reload had to add its own name to core's `consumes`. Core would then
know that an app service exists, and the plugin would stop being liftable — take
it to another project and it arrives with a strand still attached to a
`core/build` that project does not have.

**That is the one coupling this scaffold cannot afford.** `src/app_plugins`
exists to prove a feature can be removed without touching the app. A feature that
needs a line in core to work is not removable; it is only undeployed.

## the rule, which is now statable

> [core/build](../build/) names **core** services directly.
> **App** services arrive through here.

Nothing enforces which side a name is on, and nothing should. What *is* enforced
is that core's `consumes` lists carry no app names —
[`test/handover.test.js`](../../../../test/handover.test.js) reads every
`plugin.consumes` under `core/` and fails on any name core does not itself
provide.

That is the difference between a rule and an intention. Sabotaged to check it
bites: adding `'tts'` to `core/log/server.js` fails it.

The rule is **one-directional**. A plugin outside core may name whatever it
likes — `app_plugins/tts-page` consuming `pages` is perfectly ordinary.

## three details

**Put once, and it throws.** A second plugin claiming a name it does not own is
not a merge and not a preference — it is two things believing they are the same
one. It throws rather than warns, because the loser of a silent race fails later,
somewhere else, holding the wrong object.

**`get` answers `undefined`, deliberately.** A server half asks for its own main
half and has to carry on without one: `test/server-graph.test.js` builds server
halves against a bare host, and every one of them has a stand-in for that case.
Throwing here would turn *"there is no main behind me"* into *"the app does not
start"*.

**The container has no prototype.** A name like `constructor` or `toString`
would otherwise come back as a function off `Object`'s prototype, and a lookup
that answers with something plausible is worse than one that answers nothing.
