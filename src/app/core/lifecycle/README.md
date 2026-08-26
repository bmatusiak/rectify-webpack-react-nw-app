# lifecycle

Quitting, crashing, and telling the launcher we are here.

| file | provides | consumes |
|---|---|---|
| `main.js` | `lifecycle` | `app`, `log` |

```
lifecycle.shutdown(reason)   the only way out
lifecycle.isShuttingDown     true once it has started
lifecycle.publish(url)       write .nw-instance.json for the launcher
```

**The window is not the app.** Closing it hides it; `shutdown()` is what
actually ends the process. It is idempotent, because the window closing and the
server half failing both arrive here.

**Quitting has to be thorough.** `nw.App.quit()` alone does not always manage
it — the http server, socket.io and webpack's watchers are open handles, and
this context can outlive the window holding them, which leaves a copy running
with nothing on screen and the port taken. So teardown is: every plugin's
`onDestroy` in reverse, then `closeAllWindows()`, then `quit()`, then an
unref'd 300ms `process.exit(0)` as the backstop.

**An uncaught throw in nw's node context takes the app down with no window and
no message**, which is the failure mode hardest to read from outside. So
`uncaughtException` logs and shuts down deliberately, and `unhandledRejection`
logs without being fatal — silence there is what hides a broken plugin.

## the instance file

`.nw-instance.json` at the app root carries `{ pid, url }`. `tools/nw.js` reads
it to say *already running* and bring the window forward instead of starting a
second copy.

It exists because nw.js is single instance: a second launch **is** handed to the
first one, but that happens inside the nw binary where the launcher cannot see
it. A packaged build has no launcher reading this, so it writes nothing.

The file is removed on `onDestroy`. A hard kill leaves it behind, which is why
the launcher checks the pid rather than trusting the file.
