//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//ALL BUT ONE ARE ./remembering.js AND ARE ANSWERED BY ./node.test.js, in a
//tenth of a second. That is the point of the rule living in a module rather
//than in the window half: the same five faults inside ./window.js would each
//cost a trip through a running app, and the check that watches them would be
//the slowest one in the set instead of the fastest.
//
//THE LAST ONE NEEDS THE WINDOW, because it is about which STORE this sits on
//-- a question a fake cannot be wrong about, since a fake is neither.

module.exports = [
    {
        what: 'the store is asked with an empty object, so it saves and cannot load',
        file: 'remembering.js',
        check: 'core/remember/node',
        find: 'function slot(area, key, fallback) { return store(area, pair(key, fallback)); }',
        replace: 'function slot(area, key, fallback) { return store(area, {}); }'
    },
    {
        what: 'a credential is kept, because the rule is written down and not applied',
        file: 'remembering.js',
        check: 'core/remember/node',
        find: 'if (looksLike.looksSecret(text)) {',
        replace: 'if (false) {'
    },
    {
        what: 'a document is kept as though it were a place',
        file: 'remembering.js',
        check: 'core/remember/node',
        find: 'if (text.length > MOST) {',
        replace: 'if (false) {'
    },
    {
        what: 'storage that throws takes the window with it',
        file: 'remembering.js',
        check: 'core/remember/node',
        find: '        } catch (e) { return fallback; }',
        replace: '        } finally { /* sabotaged */ }'
    },
    {
        what: 'a refusal is silent, so nothing can act on it',
        file: 'remembering.js',
        check: 'core/remember/node',
        find: '            return false;\n        }',
        replace: '            return true;\n        }'
    },

    //---- and one that is NOT here, which is the finding ---------------------
    //
    //`window.js` builds the service on `preferences`, and swapping that for
    //`session` is the fault worth catching: the body would ask for a store its
    //consumes list never took, get undefined, and every write would quietly
    //return false -- an app that works all day and has forgotten everything by
    //morning. ./window.test.js DOES catch it. It is not in the list because
    //../../../../tools/sabotage.js cannot sequence it, and that is a tooling
    //gap rather than a hole in the test.
    //
    //MEASURED, THREE WAYS:
    //
    //  break it and check at once      the check passes -- the window has not
    //                                  rebuilt yet, so it tests the old bundle
    //  break it, wait 8s, check        CAUGHT, on a real assertion
    //  wait on `dist/window.js`        two minutes of waiting for a file that
    //                                  never appears, then proceeds anyway
    //
    //THERE IS NOTHING ON DISK TO WAIT FOR. Measured directly: touch a window
    //file, wait four seconds, and not one mtime under dist/ has moved.
    //webpack-dev-server serves the window bundle out of memory and only
    //`dist/server.js` is ever written -- so the `wait` that every other in-app
    //sabotage here relies on has no target in a window, and a fixed sleep is
    //the thing this repo does not do.
    //
    //WHAT WOULD CLOSE IT: ../build/main.js hands the window compiler straight
    //to devMiddleware and announces nothing, while the server half prints
    //`server bundle built in Nms`. A `done` hook logging the same for the
    //window would give the tool an EVENT to wait on -- ../log already answers
    //`since` -- and every future window-context sabotage would get it for free.
];
