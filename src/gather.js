//TURNING ONE require.context INTO THE PLUGINS OF EVERY TREE.
//
//src/server.js, src/window.js and src/main.prod.js each hand webpack a regex
//over src/ and get back every file in every folder under it that looks like a
//plugin -- `./app/core/io/server.js`, `./app_plugins/mcp/server.js`, and
//`./pr121/core/thing/server.js` if such a tree is there. This decides which of
//those the app actually loads, and what each one is called.
//
//WHY THE ROOTS ARE A FILTER RATHER THAN THE SCAN. require.context takes a
//literal directory, so a list of trees cannot be iterated into it -- it was
//literally two calls with the same regex written out twice, in three files, and
//adding a third tree meant six edits that nothing checked for agreement. One
//context over src/ takes a superset, and the list decides what survives.
//
//The cost is honest and worth saying: a folder in src/ that is NOT a listed
//tree still gets walked by webpack, and its plugins are still compiled into the
//bundle -- they are simply never registered. To keep a tree out of the build
//entirely, prefix it with `_`, which is the rule that already parks a plugin,
//or do not have it in src/. Unlisting turns a tree OFF; underscoring makes it
//not a tree at all.

//AND WHY THE LIST ARRIVES AS `BUILD_ROOTS` RATHER THAN require('./roots').
//Two reasons, and either alone would be enough. ./roots.js reads package.json,
//and requiring package.json from a bundled file puts the WHOLE manifest in the
//bundle -- devDependencies, scripts, the lot -- which is the thing
//core/appPackage/server.js exists to avoid. And a bundle read at runtime would
//be reading the wrong file anyway: a packaged app ships a staged manifest with
//six fields in it, and `app.srcDirs` is not one of them. Which trees a bundle
//contains was decided when webpack ran, so webpack is what states it --
//DefinePlugin, beside BUILD_PROD and BUILD_SERVABLE.

var wanted = require('./target');

//A PLUGIN IS NAMED AFTER ITS OWN ROOT -- `core/io/server.js` and
//`mcp/server.js`, never `app_plugins/mcp/server.js`. That name is what
//app.plugins, the Graph page, a resolution failure and `npm test -- core/ipc`
//all say, so a plugin moved from one tree to another keeps its name, which is
//the whole point of a tree being separable. See ./target.js.
module.exports = function gather(context, roots, how) {
    how = how || wanted.stamp;

    var out = [];

    context.keys().forEach(function (key) {
        var parts = key.split('/');
        if (parts[0] === '.') parts.shift();

        //the first segment is the tree it came from, and the rest is its name
        if (roots.indexOf(parts.shift()) < 0) return;

        out.push(how(context(key), parts.join('/')));
    });

    return out;
};
