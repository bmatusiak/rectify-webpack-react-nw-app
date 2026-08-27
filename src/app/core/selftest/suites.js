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

//THIRTY SECONDS, NOT FIVE -- see `run` below for why a test that hangs must
//fail instead of stopping the context.
var STUCK = 30000;

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

        //A TEST THAT HANGS FAILS, RATHER THAN TAKING THE CONTEXT WITH IT.
        //
        //The harness defaults to no timeout, so one test that never settles
        //stops the whole run -- and what gets reported is "the window did not
        //answer", which is equally true of every test in it and names none of
        //them. The suite that actually hung is invisible.
        //
        //IT IS WORSE THAN A BAD MESSAGE. A window suite that never reaches its
        //`finally` leaves mounted views and raised banners in the live page, so
        //the NEXT run counts the leftovers and hangs the same way -- and the run
        //after that. The failure walks forward through the session, always
        //appearing to accuse whatever was edited most recently.
        //
        //Measured twice in one day: once from a flaky assertion in
        //../../debug-snapshot, once from ../webStorage's own sabotage, which the
        //tool reported as "never finished rather than failing -- give that test
        //a timeout, so the failure is one somebody can read".
        //
        //THIRTY SECONDS, NOT FIVE. Some of these really are slow -- the demo
        //opens twenty pages, and a capture waits on the compositor -- so this is
        //a backstop for something that has stopped, not a budget for something
        //being careful. A caller may still say otherwise.

        //`only` is a plugin with or without its context: core/ipc, core/ipc/main
        run: function (options) {
            var only = options && options.only;

            return mine.run(Object.assign({ timeoutMs: STUCK }, options || {}, {
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
