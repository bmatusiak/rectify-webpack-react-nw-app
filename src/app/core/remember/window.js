var Remembering = require('./remembering');

//WHERE YOU WERE: the page, the pane, the row you had picked.
//
//WHY IT IS WORTH ANYTHING HERE. This window restarts constantly -- every change
//to src/main.js or webpack.config.js needs one, and a packaged app gets one
//every launch. It comes back on the first page with nothing selected, and the
//cost of that is not the four seconds; it is finding your place again, which is
//paid by whoever is working ON the app rather than by the app.
//
//IT SITS ON `preferences` AND NOT ON `session`, WHICH IS THE WHOLE CHOICE.
//sessionStorage survives a reload and dies with the window, and dying with the
//window is precisely the case this exists to survive. The demo kept the open
//page in `session` for exactly that reason -- a reload was the only thing it
//had to beat -- and a restart still opened on page one.
//
//THE RULE IS IN ./remembering.js WITH THE CHECKS THAT ENFORCE WHAT THEY CAN OF
//IT, so ./node.test.js can put it in states a running window will not hold
//still in -- a store that throws, a value that is secret-shaped. What is left
//here is the wiring, which is the part that needs the app.

plugin.consumes = ['preferences'];
plugin.provides = ['remember'];
async function plugin(imports, register) {

    //`console.warn` RATHER THAN ../log, and that is a deliberate loss. The log
    //lives on the node side and this is a window plugin with no socket -- taking
    //`io` to report a refused write would make remembering which tab you were on
    //depend on the connection being up, which is the one thing it must not do.
    await register(null, {
        remember: Remembering(imports.preferences, function (line) { console.warn(line); })
    });
}
module.exports = plugin;
