# _example

**Where a plugin starts.** Copy this folder, rename it, take the underscore off,
delete what you do not need.

```sh
cp -r src/app/_example src/app/my-thing
# edit the files, then:
npm run restart
```

That is the whole of installing it. **The underscore is why this does not run** —
every discovery site skips a folder starting with `_`, both disk walks and the
one `require.context` — so this is a template rather than a plugin, and taking
the underscore off is the switch.

## what is in it

| file | shows |
|---|---|
| `server.js` | logging, keeping something, a job on a timer, an ipc command, answering the page, a route |
| `window.js` | registering a page, the person's own storage, asking the node half |

**Everything in them is optional.** A plugin that answers one ipc command and
nothing else is a perfectly good plugin. Delete the rest.

The two halves talk to each other — the page asks `example:hello` and the node
half answers — so with the underscore off you get a working **Example** page in
the sidebar and `node src/cli.js example` in the terminal.

## the four contexts

There are two files here and there could be four. A plugin is a folder that
answers to as many of the four runtimes as it has something to say to, and the
filename is what decides:

| file | runs in |
|---|---|
| `main.js` | nw's node side — off disk, never reloads |
| `server.js` | the app's node half — bundled, reloaded on every save |
| `window.js` | the browser — the only code that reaches the page |
| `cli.js` | a terminal talking to a running app |

**Most plugins want `server.js`.** Everything core carries — `log`, `state`,
`cron`, `dataDir` — is handed to that half, so `main.js` is only needed for
something that must survive a reload or must own a real nw object.

## what to add next

A new plugin needs two things or the suite goes red, and both are the point
rather than paperwork:

- **a `README.md`** with a table of its contexts and their `provides`/`consumes`.
  `test/readme.test.js` reads that table back off the source, so it cannot
  quietly stop being true.
- **a `<context>.test.js`** beside each context file — a test that is itself a
  plugin, run inside the real app against the real services.

Optionally a **`node.test.js`** for whatever can be answered without an app, and
a **`sabotage.js`** listing what would break it and which suite should notice.

## this folder is checked, even though nothing loads it

`test/example.test.js` reads every service this template asks for and fails if
one of them no longer exists.

That check earns its place: the underscore that keeps this from loading also
keeps it out of the readme audit and the per-plugin test rule, so it is the one
thing here that could rot with nothing going red. **A rotten template is worse
than none** — somebody starts from it, gets a service that was renamed, and
concludes the scaffold is broken.

It is not hypothetical. `settings` became `preferences` and `storage` became
`webStorage` in a single afternoon; a template written the day before would have
been wrong by teatime.
