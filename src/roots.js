//WHERE PLUGINS COME FROM, WHICH IS MORE THAN ONE PLACE.
//
//`src/app` is this app's own plugins. `src/app_plugins` is a second tree of
//them, and it exists to prove the claim the rest of the documentation makes:
//adding a plugin is adding a folder, and nothing lists them. If that is true,
//then adding a whole TREE of plugins should be adding a folder too -- and it
//is, apart from this line.
//
//WHY A SECOND TREE RATHER THAN ANOTHER GROUP UNDER src/app. A group -- `core`,
//`ui`, `demo` -- is a folder inside the app, and deleting it is a decision
//about this app. A tree is separable: `src/app_plugins` can be a checkout, a
//submodule, a package somebody else maintains, or gone entirely, and the app
//still boots because nothing consumes what is not there. The MCP plugins live
//there for exactly that reason -- they are a feature this scaffold OFFERS, not
//one it depends on.
//
//A TREE THAT IS NOT THERE IS NOT AN ERROR on the disk-walking side: src/main.js
//and src/cli.js skip a root that does not exist. Webpack cannot do the same --
//`require.context` on a missing directory fails the build -- so the folder is
//committed with a README even when it holds nothing else.
//
//Both are scanned two levels deep, and every rule about what a plugin is (`_`
//and `.` prefixes skipped, `vendor` skipped) applies to both.
module.exports = ['app', 'app_plugins'];
