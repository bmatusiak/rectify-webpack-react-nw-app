//WHICH TREES THIS APP LOADS PLUGINS FROM -- read out of package.json, which is
//where it is decided:
//
//    "app": { "srcDirs": ["src/app", "src/app_plugins"] }
//
//`src/app` is this app's own plugins. Anything beside it is a separable tree:
//a checkout, a submodule, a package somebody else maintains, a branch being
//tried out -- `src/pr121/core/thing` loads exactly as `src/app/core/thing`
//does, and unlisting one line turns it off without touching a file it owns.
//
//WHY THE MANIFEST RATHER THAN THIS FILE. It was this file, as a literal array,
//and that was one line to edit -- but it was a line of the app's SOURCE. An app
//built on this scaffold adding its own tree had to edit a scaffold file, and so
//had a merge conflict waiting in it every time the scaffold moved. package.json
//is the file an app already owns and already edits: it carries the name, the
//title, `serve` and `canServe` for the same reason. Nothing else changed --
//every consumer still asks this file, because the entries are validated on the
//way out and the answer is a shape webpack, the disk walks and the tools all
//want in slightly different forms.
//
//WHAT THIS ANSWERS IS FOLDER NAMES, not the paths that went in: `['app',
//'app_plugins']`. Every caller joins them onto something -- `src/` on disk,
//`./` inside a bundle -- and a caller that had to strip `src/` off first would
//be a sixth place that knows the layout.
//
//A TREE THAT IS NOT ON DISK IS NOT AN ERROR. src/main.js and src/cli.js skip a
//root that is missing, and the bundles no longer care at all: one require.context
//covers src/ and the roots are a filter, so a listed-but-absent folder is simply
//never matched. That used to be a build failure -- require.context pointed at a
//missing directory -- which is why src/app_plugins was committed with a README
//in it even when it held nothing else. It no longer has to be.
//
//Every tree is scanned two levels deep, and every rule about what a plugin is
//(`_` and `.` prefixes skipped, `vendor` skipped) applies to all of them.

var pkg = require('../package.json');

//AN APP WITH NO srcDirs IS THE SCAFFOLD BEFORE ANYBODY TOUCHED IT, and it still
//boots. Defaulting is not the same as guessing: src/app is where this file's own
//neighbours are.
var DEFAULT = ['src/app'];

var SEPARATOR = String.fromCharCode(92);//windows paths arrive either way

//REFUSED, NAMING THE KEY -- the same answer `canServe` gives. A srcDir the
//discovery rules cannot match would load nothing, and a tree that loads nothing
//looks exactly like a tree whose plugins are all broken.
function refuse(entry, why) {
    throw new Error(
        'package.json "app": { "srcDirs": [...] } has "' + entry + '", which ' + why);
}

function named(entry, at, all) {
    var flat = String(entry).split(SEPARATOR).join('/');
    var parts = flat.split('/').filter(function (bit) { return bit && bit !== '.'; });

    //ONE FOLDER INSIDE src/, AND NOTHING ELSE, because a bundle cannot follow
    //it anywhere else: webpack's require.context is rooted at src/ and reaches
    //down, never up. "../shared/plugins" would walk off disk in development and
    //be missing from the package, which is the exact failure the five discovery
    //sites are held together to prevent -- so it is refused here instead.
    if (parts[0] !== 'src' || parts.length !== 2)
        refuse(entry, 'is not one folder inside src/ -- "src/app_plugins", not "' + flat + '"');

    var name = parts[1];

    //a leading _ or . is how a plugin is parked, and the rule applies to a tree
    //as well: every discovery regex and both disk walks skip such a folder, so
    //listing one here would be a tree that is on and off at the same time
    if (name.charAt(0) === '_' || name.charAt(0) === '.' || name === 'vendor')
        refuse(entry, 'starts with ' + name.charAt(0) + ', which everything that looks for plugins skips');

    if (all.indexOf(entry) !== at)
        refuse(entry, 'is listed twice, so every plugin in it would be registered twice');

    return name;
}

function of(srcDirs) {
    return (srcDirs || DEFAULT).map(named);
}

module.exports = of(pkg.app && pkg.app.srcDirs);

//THE LIST, AND THE RULE, SEPARATELY. The array above is what everything uses;
//`of` is the same validation applied to a list somebody hands it, which is how
//test/plugin-scan.test.js checks that a bad srcDir is refused without editing
//package.json to find out.
module.exports.of = of;
