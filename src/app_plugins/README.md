# app_plugins

A **second tree of plugins**, beside `src/app`, and the reason it exists is to
be deleted.

The rest of this scaffold claims that adding a plugin is adding a folder and
that nothing lists them. If that is true then adding a whole *tree* of plugins
should be adding a folder too — and it is, apart from one line in
[`src/roots.js`](../roots.js). Everything else finds it: both disk walks, all
three `require.context` calls, the test that holds them to one answer, the
README audit, and the run that drives the app.

| what | where |
|---|---|
| [mcp](mcp/) | an MCP server for this app, over the control socket it already has |

## why a tree rather than another group under src/app

`core`, `ui` and `demo` are groups *inside* the app, and deleting one is a
decision about this app. A tree is **separable**: this folder can be a checkout,
a submodule, a package somebody else maintains, or gone entirely, and the app
still boots — because nothing in `src/app` consumes anything here.

That is the test of whether the plugin idea holds. A feature the scaffold
*offers* should be removable without touching the scaffold, and a feature it
*depends on* belongs in `core`.

**Delete this folder and nothing breaks.** The MCP tools stop being offered, the
bridge says the app is not answering, and every other test still passes. The one
thing that would break is `require.context`, which fails a build when pointed at
a directory that is not there — so if you remove it, remove the second context
in `src/server.js`, `src/window.js` and `src/main.prod.js`, or leave this README
behind as the folder.

## the rules are the same rules

Two levels deep, `main.js` / `server.js` / `window.js` / `cli.js` per context, a
`README.md` per plugin with a table that `test/readme.test.js` reads back off
the source, and `<context>.test.js` beside the code. Folders starting with `_`
or `.`, and folders called `vendor`, are skipped here exactly as they are there.

A plugin here is named after its own root — `mcp/server.js`, not
`app_plugins/mcp/server.js` — so it reads the same way `core/io/main.js` does in
`app.plugins`, on the Graph page, and in a resolution failure.
