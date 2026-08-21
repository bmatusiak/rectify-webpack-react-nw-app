# selftest

Running the tests inside the app.

| file | provides | consumes |
|---|---|---|
| `main.js` | `selftest` | `app`, `ipc`, `io` |
| `server.js` | `selftest` | `ipc` |
| `window.js` | `selftest` | `io` |
| `cli.js` | `selftest` | — |

Plus **`suites.js`** — one context's suites, and which plugin each came from.

```js
var { describe, it, assert } = imports.selftest;
```

The only plugin here with **no test beside it**, because it is the runner:
testing it with itself proves nothing its passing does not already prove.

## why not boot a context from a test file

None of the four is easy to boot from `node --test`, and two are impossible:
`main` needs nw around it, `window` needs a document and a stylesheet that
actually loaded. So do not boot any of them — **ask the running app**, which is
already in all four, to run its own suites and say what happened.

`main.js` is the collector. One ipc command that runs the main harness here,
calls the node half's through `ipc.invoke`, asks the window over the socket, and
hands back all three. The cli context is not part of the running app, so the
driver (`tools/test.js`, `tools/drive.js`) runs that one itself.

`ipc.invoke` and not a socket to ourselves: the node half registers
`selftest:server` as it loads, and something in this process has no wire to
reach it by.

## why the harness is a service

`require('@bmatusiak/rectify/harness.js')` exports **one shared instance**, and
in development `main` and `server` are the same node process — they share a
module registry, so both contexts collected into one set of suites and each
reported the other's results as its own.

`harness.create()` gives an independent one, and handing it out **as a service**
is what makes a test plugin say which context it belongs to: by consuming the one
in its own graph.

It has `ok`, `equal` and `notEqual` and **no `deepEqual`** — these run inside the
app, which is not always node.

## targeting, at run time

Every test plugin is loaded all the time in development, so targeting cannot
happen at load — a flag deciding what to *load* would mean restarting the app to
change target, which is the thing this avoids.

So `src/target.js` wraps each test plugin and calls `as(name)` just before it is
set up; every `describe` that plugin makes is attributed to it; and
`run({ only })` filters on that. `only` is a plugin with or without its context
— `core/ipc` or `core/ipc/main`.

Contexts are filtered the same way, one level up: `npm test -- window` asks for
the browser suites and nothing else, rather than waiting on the two it did not
ask about.

## missing is not stuck

```
missing    had nothing to run. a fact about how the app was started → skip
stuck      had something to run and did not finish              → failure
```

Telling them apart matters. Reporting `stuck` as a skip is how a window test
that hangs passes in silence.

The window timeout is **120s and deliberately generous** — `demo/window.test.js`
opens every page and waits for each to settle, which is slower than everything
else here put together.

## not in a package

Each `require.context` that gathers test plugins sits inside a check webpack
drops, and `src/main.prod.js` has no equivalent path at all.
`npm run drive -- --build --selftest` says so rather than reporting three empty
contexts as failures.
