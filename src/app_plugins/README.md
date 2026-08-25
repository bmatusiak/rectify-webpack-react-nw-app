# app_plugins

A **second tree of plugins**, beside `src/app`, and the reason it exists is to
be deleted.

The rest of this scaffold claims that adding a plugin is adding a folder and
that nothing lists them. If that is true then adding a whole *tree* of plugins
should be adding a folder too — and it is, apart from one line in the manifest:

```json
"app": { "srcDirs": ["src/app", "src/app_plugins"] }
```

[`src/roots.js`](../roots.js) reads that and validates it, and everything else
asks it: both disk walks, all three `require.context` calls, the test that holds
them to one answer, the README audit, and the run that drives the app.

**This is how a feature arrives from somewhere else.** `src/pr121/core/thing`
loads exactly as `src/app/core/thing` does, so a branch, a checkout or somebody
else's package can be dropped in beside the app, listed, tested against the real
graph, and unlisted again — without a line of the app changing.

| what | where |
|---|---|
| [mcp](mcp/) | an MCP server for this app, over the control socket it already has |
| [mcp-example](mcp-example/) | one of every MCP surface, registered against the real app |
| [tts](tts/) | saying something out loud, from either half |

## why a tree rather than another group under src/app

`core`, `ui` and `demo` are groups *inside* the app, and deleting one is a
decision about this app. A tree is **separable**: this folder can be a checkout,
a submodule, a package somebody else maintains, or gone entirely, and the app
still boots — because nothing in `src/app` consumes anything here.

That is the test of whether the plugin idea holds. A feature the scaffold
*offers* should be removable without touching the scaffold, and a feature it
*depends on* belongs in `core`.

**Delete this folder and nothing breaks.** The MCP tools stop being offered, the
bridge says the app is not answering, and every other test still passes. Take
the line out of `srcDirs` as well, or leave it — a listed tree that is not on
disk is skipped by the disk walks and never matched by the one `require.context`
over `src/`. That used to fail the build outright, when there was a context
pointed at this folder by name, which is why this README was here before there
was anything to say.

## the rules are the same rules

Two levels deep, `main.js` / `server.js` / `window.js` / `cli.js` per context, a
`README.md` per plugin with a table that `test/readme.test.js` reads back off
the source, and `<context>.test.js` beside the code. Folders starting with `_`
or `.`, and folders called `vendor`, are skipped here exactly as they are there.

A plugin here is named after its own root — `mcp/server.js`, not
`app_plugins/mcp/server.js` — so it reads the same way `core/io/main.js` does in
`app.plugins`, on the Graph page, and in a resolution failure.
