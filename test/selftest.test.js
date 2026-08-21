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
//AN APP THAT IS ALREADY RUNNING IS THE POINT, NOT AN OBSTACLE.
//
//In development every context loads its test plugins as it starts, so a running
//app can be asked for any of them at any time. That is the loop this is for:
//leave the app open, change something, run one test, read what came back,
//change it again. Webpack reloads both halves on save, so an edited test is in
//the app a second later with nothing restarted.
//
//it shuts down only what it started.

const TIMEOUT = 180000;

//tools/test.js sets these when a single thing was asked for. Empty means all of
//it, which is what `npm test` on its own does.
const ONLY = process.env.TEST_ONLY || '';
const CONTEXTS = (process.env.TEST_CONTEXTS || '').split(',').filter(Boolean);

function asked(name) { return !CONTEXTS.length || CONTEXTS.indexOf(name) >= 0; }

test('the plugins, tested inside the app', { timeout: TIMEOUT }, async (t) => {
    const { app, ipc, selftest: cli } = await selftest.cliGraph();

    //THE CLI CONTEXT runs here: it is a short-lived process talking to the app
    //rather than part of it, so whoever builds the graph runs its suites.
    if (asked('cli')) await report(t, 'cli', await cli.run({ only: ONLY || null }));

    //and if that was all that was asked for, there is no reason to start an app
    if (CONTEXTS.length && !CONTEXTS.some((c) => c !== 'cli')) {
        await app.destroy();
        return;
    }

    const wasRunning = await ipc.running();

    if (!wasRunning) {
        assert.ok(selftest.start([]), 'the app did not start');

        const views = await selftest.waitForView(ipc);
        assert.ok(views.views.length > 0, 'the window never connected');
    }

    const out = await ipc.call('selftest', {
        contexts: CONTEXTS.length ? CONTEXTS.filter((c) => c !== 'cli') : null,
        only: ONLY || null
    }, 150000).catch((e) => ({ error: e.message }));
    assert.ok(!out.error, 'the app would not run its suites: ' + out.error);

    for (const context of out.contexts) await report(t, context.context, context);

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
