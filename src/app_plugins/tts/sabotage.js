//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//Each entry is run by ../../../tools/sabotage.js: break that one line, run
//`npm test -- tts`, put it back, and say whether anything went red. All of them
//are things that DID go wrong here, not invented faults -- two of them were
//found by this file's own first run, when they survived.
//
//EACH ONE NAMES THE CHEAPEST CHECK THAT SHOULD CATCH IT, which is most of
//what makes the set runnable at all. Six of these are ./speech.js and are
//answered by ./node.test.js in a fifth of a second; running the whole plugin
//for each would be eight trips through a real app, three minutes, and the
//suite that actually watches the line would be buried in the other thirty.
//
//A SURVIVING ENTRY IS THE FINDING. It means the behaviour is undefended, and
//the honest answer is usually not "add an assertion" but "the test cannot reach
//that state" -- which is what moved `loadVoices` and `fallsBack` out of
//./window.js and into ./speech.js, where a fake synthesizer can be put in a
//state a running window will not hold still in.

module.exports = [
    {
        what: 'text is spliced into the powershell command line',
        file: 'speech.js',
        check: 'tts/node',
        find: "args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL],",
        replace: "args: ['-NoProfile', '-Command', POWERSHELL + String(text)],"
    },
    {
        what: 'a paragraph is handed over whole rather than chunked',
        file: 'speech.js',
        check: 'tts/node',
        find: 'if ((buffer + \' \' + sentence).trim().length > max) {',
        replace: 'if (false) {'
    },
    {
        what: 'the wait for voiceschanged is dropped, so an empty first call is believed',
        file: 'speech.js',
        check: 'tts/node',
        find: '        var ready = synth.getVoices();',
        replace: '        var ready = synth.getVoices(); return resolve(ready);'
    },
    {
        what: 'a synthesizer that never answers is waited on forever',
        file: 'speech.js',
        check: 'tts/node',
        find: 'var timer = setTimeout(done, wait || 3000);',
        replace: 'var timer = null;'
    },
    {
        what: 'a refusal is never handed to the node half',
        file: 'speech.js',
        check: 'tts/node',
        find: "return !!(error && error.reason === 'not-allowed') && !spoken && !via;",
        replace: 'return false;'
    },
    {
        what: 'a refusal restarts a paragraph that was already half spoken',
        file: 'speech.js',
        check: 'tts/node',
        find: "return !!(error && error.reason === 'not-allowed') && !spoken && !via;",
        replace: "return !!(error && error.reason === 'not-allowed') && !via;"
    },

    //THE TWO THAT NEED THE APP, so they name the file webpack rebuilds and wait
    //for it. Without that the suite runs against the bundle on its way out and
    //reports on code that is no longer there -- which is a green run for a
    //sabotage that never reached the app.
    {
        what: 'stop kills one chunk and the loop starts the next',
        file: 'server.js',
        check: 'tts/server',
        find: '            if (mine !== generation) break;',
        replace: '            //sabotaged',
        wait: 'dist/server.js'
    },
    {
        what: 'an empty string is spoken rather than refused',
        file: 'server.js',
        check: 'tts/server',
        find: "if (!text.trim()) throw new Error('there is nothing to say');",
        replace: "if (!text.trim()) text = ' ';",
        wait: 'dist/server.js'
    }
];
