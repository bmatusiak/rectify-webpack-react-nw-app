# cli

The command table for `src/cli.js`.

| file | provides | consumes |
|---|---|---|
| `cli.js` | `cli` | `app`, `ipc` |

```js
imports.cli.command('capture', {
    help: 'take a picture of the window',
    args: ['path'],                       //so `capture shot.png` works
    run: async function (data) { ... }
});
```

**A command is local unless it is not.** Anything the table does not know is
forwarded to the running app over the control socket, so a plugin that answers
on `ipc` is reachable from the terminal **without a `cli.js` at all** — `open`,
`hide` and `quit` are registered by [window](../window/)'s server half and
nothing declares them here.

A `cli.js` earns its place when something has to happen *in the terminal
process*: resolving a path against your working directory rather than the app's,
printing a table, or asking a question.

**A command can name what it takes**, so the common case is typed the way it is
spoken — `click Save` rather than `click '{"selector":"Save"}'`. An argument
starting with `{` is parsed as json instead, which still wins when the names do
not cover what you want to say. A command with no `args` and a non-json argument
says so rather than guessing.

`help` lists the local table and then asks the running app for its own, so what
you see is what this app answers to right now. With nothing running, the local
half still lists.
