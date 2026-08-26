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

    //---- and the one that needed the tool to grow a verb ------------------
    //
    //`window.js` builds the service on `preferences`, and swapping that for
    //`session` is the fault worth catching: the body asks for a store its
    //consumes list never took, gets undefined, and every write quietly returns
    //false. An app that works all day and has forgotten everything by morning.
    //
    //IT WAS LEFT OUT, WITH THE MEASUREMENTS, because nothing could sequence it.
    //Every other in-app sabotage here waits on a bundle's mtime, and there is no
    //such file for a window: measured directly, NOTHING on disk changes when the
    //window bundle rebuilds -- webpack-dev-server serves it from memory and only
    //`dist/server.js` is ever written. Waiting on `dist/window.js` spent two
    //minutes on a file that never appears and then proceeded anyway.
    //
    //`restart: true` IS THE ANSWER, and it arrived for a different reason: four
    //core/state sabotages reported as surviving against an app that had never
    //seen them, because a main.js is read off disk by the boot and never again.
    //A restart is the one event that covers both.
    {
        what: 'the body asks for a store its consumes list never took',
        file: 'window.js',
        check: 'core/remember/window',
        restart: true,
        find: 'Remembering(imports.preferences,',
        replace: 'Remembering(imports.session,'
    }
];
