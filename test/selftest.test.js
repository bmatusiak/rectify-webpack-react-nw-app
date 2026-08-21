const { test } = require('node:test');
const assert = require('node:assert');

const selftest = require('../tools/selftest');

//THE OTHER HALF OF `npm test`.
//
//Everything else in this folder is what can be answered without a running app:
//the shape of the tree, the build, pure logic. The behaviour of the plugins
//lives beside them as <context>.test.js and needs the runtime each context
//actually has -- nw for `main`, a document for `window`, the real host for
//`server`.
//
//so this starts the app, asks it to run its own suites, and reports each one
//here. That is what makes `npm test` mean the whole thing again rather than
//only the part that was convenient.
//
//it leaves an app that was already running alone, in both directions: it does
//not shut down something it did not start, and it does not restart one that was
//started without --selftest just to get its suites -- it says so instead.

const TIMEOUT = 180000;

test('the plugins, tested inside the app', { timeout: TIMEOUT }, async (t) => {
    const { app, ipc, selftest: cli } = await selftest.cliGraph({ withTests: true });

    //THE CLI CONTEXT runs here: it is a short-lived process talking to the app
    //rather than part of it, so whoever builds the graph runs its suites.
    await report(t, 'cli', await cli.run({ log: function () {} }));

    const wasRunning = await ipc.running();

    if (!wasRunning) {
        assert.ok(selftest.start(['--selftest']), 'the app did not start');

        const views = await selftest.waitForView(ipc);
        assert.ok(views.views.length > 0, 'the window never connected');
    }

    const out = await ipc.call('selftest', {}, 120000).catch((e) => ({ error: e.message }));
    assert.ok(!out.error, 'the app would not run its suites: ' + out.error);

    for (const context of out.contexts) {
        //an app that was already up may not have been started with --selftest,
        //and killing somebody's running app to find out is not this test's
        //business. Say which it is rather than failing or quietly passing.
        if (!wasRunning || selftest.counted(context) > 0) {
            await report(t, context.context, context);
            continue;
        }

        await t.test(context.context + ' -- skipped', { skip: 'the app was already running, and without --selftest' },
            () => {});
    }

    if (!wasRunning) await ipc.call('quit', {}).catch(() => {});
    await app.destroy();
});

//each suite the context registered, one subtest each, so a failure names itself
async function report(t, name, results) {
    if (results.stuck) {
        //it had suites and did not finish. Skipping that would be reporting a
        //hang as an absence.
        await t.test(name + ' -- ' + results.missing, () => {
            throw new Error(results.missing);
        });
        return;
    }

    if (results.missing) {
        await t.test(name + ' -- ' + results.missing, { skip: results.missing }, () => {});
        return;
    }

    const ran = selftest.counted(results);
    await t.test(name + ': loaded its suites', () => {
        assert.ok(ran > 0, 'no tests ran in the ' + name + ' context');
    });

    for (const suite of results.suites) {
        for (const one of suite.tests) {
            await t.test(name + ' -- ' + suite.name + ' -- ' + one.name, () => {
                if (!one.ok) throw new Error(one.error);
            });
        }
    }
}
