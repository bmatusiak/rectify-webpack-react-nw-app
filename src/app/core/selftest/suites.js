var harness = require('@bmatusiak/rectify/harness.js');
var wanted = require('../../../target');

//ONE CONTEXT'S SUITES, AND WHICH PLUGIN EACH CAME FROM.
//
//The harness module exports a single shared instance, and in development `main`
//and `server` are the same node process -- so one instance between them meant
//each reported the other's results as its own. Every context calls this and
//gets its own.
//
//the tagging is what makes a single plugin runnable without restarting the app.
//In development every test plugin is loaded all the time, so targeting cannot
//happen at load; `as` is called by the wrapper in src/target.js just before a
//test plugin is set up, and every `describe` that plugin makes is attributed to
//it. Then `run({ only })` filters by that.

module.exports = function suites() {
    var mine = harness.create();

    var tags = {};
    var loading = null;

    return {
        assert: mine.assert,
        it: mine.it,

        //said by the loader's wrapper, not by the test
        as: function (name) { loading = name; },

        describe: function (name, fn) {
            tags[name] = loading;
            return mine.describe(name, fn);
        },

        //`only` is a plugin with or without its context: core/ipc, core/ipc/main
        run: function (options) {
            var only = options && options.only;

            return mine.run(Object.assign({}, options || {}, {
                log: function () {},
                testFilter: !only ? undefined : function (testName, suiteName) {
                    return wanted(tags[suiteName] || '', only);
                }
            }));
        },

        //what this context has to aim at, so a caller can say when it found
        //nothing rather than reporting an empty run as a pass
        registered: function () {
            return Object.keys(tags).map(function (name) {
                return { suite: name, plugin: tags[name] };
            });
        }
    };
};
