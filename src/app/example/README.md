# example

**Where a plugin starts.** Copy this folder, rename it, delete what you do not
need.

| file | provides | consumes |
|---|---|---|
| `server.js` | — | `app`, `log`, `state`, `cron`, `ipc`, `io`, `Plugin` |
| `window.js` | — | `react`, `theme`, `pages`, `io`, `preferences`, `Plugin` |

```sh
cp -r src/app/example src/app/my-thing
# edit the files, then:
npm run restart
```

That is the whole of installing it — nothing lists plugins, so a folder in the
tree *is* a plugin.

## it runs, and that is the point

This used to be `_example`, parked behind the underscore every discovery site
skips. It runs now, on purpose: **a template nothing loads is the one thing in
this repo that can rot without anything going red.**

That is not hypothetical, and it is not only about renamed services. Parked, it
had no tests beside it and no README table — so the moment anybody took the
underscore off, `test/plugin-scan.test.js` and `test/readme.test.js` went red
before they had written a line. The template did not contain what the scaffold
requires of every plugin, and nothing could say so.

It was also carrying a live fault. `server.js` reads a `state` document *while
it is being set up*, and `test/server-graph.test.js` builds the node half
against a stand-in host — which had drifted, and no longer carried the six
services `core/build` hands over. Un-parking this folder took nine assertions
down with it and found the drift. Parked, it had been hiding for a whole
session.

So the trade is deliberate: keeping it live costs a page in the sidebar and an
`example` command in the terminal, and buys a template that cannot quietly stop
being true.

**Delete it if you do not want it.** It provides nothing and nothing consumes
it, which is the same property that makes the demo deletable.

## what is in it

| file | shows |
|---|---|
| `server.js` | logging, keeping something, a job on a timer, an ipc command, answering the page, a route |
| `window.js` | registering a page, the person's own storage, asking the node half |
| `server.test.js` | asking the real services what the plugin did to them |
| `window.test.js` | the page it registered, and the round trip the page makes |

**Everything in them is optional.** A plugin that answers one ipc command and
nothing else is a perfectly good plugin. Delete the rest.

The two halves talk to each other — the page asks `example:hello` and the node
half answers — so you get an **Example** page in the sidebar and
`node src/cli.js example` in the terminal.

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

## what a copy of this needs

Both of these come with the folder, so a copy starts green and stays that way:

- **a `README.md`** with a table of its contexts and their `provides`/`consumes`.
  `test/readme.test.js` reads that table back off the source, so it cannot
  quietly stop being true. **Change the title and the table** — a copy that
  still says `example` is a copy claiming to be this.
- **a `<context>.test.js`** beside each context file — a test that is itself a
  plugin, run inside the real app against the real services. `plugin-scan` goes
  red for a context that has none.

Optionally a **`node.test.js`** for whatever can be answered without an app, and
a **`sabotage.js`** listing what would break it and which suite should notice.

## and it is still checked as text

`test/example.test.js` reads every service this folder asks for and fails if one
no longer exists. Being live already catches that — an unresolvable service
stops the app from starting at all — but the text check answers it **without an
app**, in a millisecond, and names the file and the service instead of failing
somewhere inside a boot.
