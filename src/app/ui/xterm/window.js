var React = require('react');
var { useRef, useEffect, useImperativeHandle, forwardRef } = React;

//THE TERMINAL AND THE ONE ADDON THIS APP USES, required rather than fetched —
//the same decision ../editor makes about ace, for the same reason. Both files
//are UMD, so a require gives back the module they publish.
var xterm = require('./vendor/xterm/xterm.js');
var fitAddon = require('./vendor/xterm/addon-fit.js');
//IT CANNOT LAY OUT WITHOUT THIS. xterm measures a character cell out of the DOM
//and positions every row against it; with no stylesheet the rows stack at the
//browser's default line height and the cursor lands nowhere near the text. It is
//the one plain .css file in the app, and webpack.config.js says why it has a
//rule of its own.
require('./vendor/xterm/xterm.css');

//---------------------------------------------------------------------------
//a terminal: bytes that arrived from somewhere else.
//
//A <pre> IS NOT GOOD ENOUGH, AND THIS TIME IT IS NOT ABOUT LOOKS AT ALL. What
//comes back from a machine is not text — it is drawing instructions. A pty
//answers with escape sequences that move the cursor, repaint a line, clear the
//screen and colour a word, and a `<pre>` renders those as garbage in the middle
//of the output somebody is trying to read. This app already learned that once
//from the other end: a URL scraped out of `script -qec` arrived wrapped and
//doubled because nothing had stripped the escapes.
//
//SO IT IS THE SAME ARGUMENT ../editor MAKES. That one exists because a hundred
//lines of undifferentiated JavaScript is something a person scrolls past and
//approves anyway. This one exists because a terminal's output is unreadable
//without something that understands it, and a person who cannot read what a
//machine said cannot judge what it did.
//
//A PLUGIN OF ITS OWN, WITH ITS OWN VENDOR FOLDER. xterm is 488KB and belongs to
//exactly one concern. Swap this plugin and the panes do not change.
//
//NO NATIVE MODULE, AND THAT IS THE POINT. A terminal usually implies a pty,
//which on Windows means node-pty — a compiled dependency that has to match the
//Node ABI NW.js was built against, and that is exactly the kind of thing this
//project does not have. It is not needed: `ssh -tt` allocates the pty on the
//machine at the far end, which is where the shell actually is. This side only
//moves bytes.
//
//AND IT MOVES NO BYTES ITSELF. Nothing here opens a connection, spawns anything
//or knows what a machine is. It is a surface: write to it, read what was typed
//into it, and size it to its box. Whatever carries the bytes is somebody else's
//plugin, and the relay that would carry them is not built yet.
//
//IT KNOWS NOTHING ABOUT THE THEME, deliberately. The theme consumes this, not
//the other way round: every pane consumes the theme, so a theme that this
//consumed back would be a cycle. Same shape as ../editor and the guard hook.
//---------------------------------------------------------------------------

plugin.consumes = ['react'];
plugin.provides = ['xterm'];
async function plugin(imports, register) {

    var Terminal = xterm.Terminal;
    var FitAddon = fitAddon.FitAddon;

    //TWO PALETTES, AND THE CALLER PICKS. Not the plugin: it still knows nothing
    //about the theme, for the same reason as ../editor and ../litegraph. What it
    //can do is offer both and let whoever knows which mode is showing say so --
    //`look(mode)`.
    //
    //THE SIXTEEN ANSI COLOURS ARE PART OF THE PALETTE, not decoration. xterm's
    //defaults are chosen for a black terminal, so on a light one the yellows and
    //greens vanish and the "bright black" a program uses for de-emphasis becomes
    //invisible. A light terminal that only flips the background is a light
    //terminal nobody can read.
    var BASE = {
        fontFamily: 'Consolas, "Cascadia Mono", monospace',
        fontSize: 13,
        //KEPT, because the whole point of a terminal is reading what went past.
        scrollback: 5000
    };

    var DARK = {
        background: '#0a0d12', foreground: '#c9d1d9', cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        //LIFTED FROM #6e7681, which is what a github-dark palette uses and which
        //measures 3.6:1 on this background -- under the floor for the grey that
        //carries prompts and file paths. #8b949e is 6.2:1.
        brightBlack: '#8b949e', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
    };

    var LIGHT = {
        background: '#ffffff', foreground: '#1f2328', cursor: '#0969da',
        selectionBackground: '#b6dcff',
        black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
        blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
        brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
        brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9',
        brightCyan: '#3192aa', brightWhite: '#8c959f'
    };

    //BUILT ONCE, SO THE IDENTITY IS STABLE. The component watches `look` to
    //recolour a live terminal, and an object literal rebuilt on every render
    //would make that effect fire on every render.
    var LOOKS = {
        dark: Object.assign({}, BASE, { theme: DARK }),
        light: Object.assign({}, BASE, { theme: LIGHT })
    };

    function look(mode) { return mode === 'light' ? LOOKS.light : LOOKS.dark; }

    //A REF RATHER THAN A PROP FOR THE BYTES, and that is the whole shape of this
    //component. Output arrives continuously and is APPENDED; a `text` prop would
    //mean re-rendering the terminal on every chunk, and re-rendering a terminal
    //means throwing away the scrollback somebody is reading. So the caller holds
    //a handle and writes into it.
    var Term = forwardRef(function Term({ onData, onResize, look: wanted, height }, ref) {
        var host = useRef(null);
        var term = useRef(null);
        var fit = useRef(null);

        useEffect(function () {
            if (!host.current) return;

            var t = new Terminal(Object.assign({}, LOOKS.dark, wanted || {}, {
                //A CURSOR THAT BLINKS ONLY WHERE SOMETHING CAN BE TYPED. A
                //captured console is being READ, and a blinking cursor on it is
                //a promise that a keystroke goes somewhere.
                cursorBlink: !!onData,
                disableStdin: !onData
            }));
            var f = new FitAddon();
            t.loadAddon(f);
            t.open(host.current);
            term.current = t;
            fit.current = f;

            //FITTED AFTER THE BOX EXISTS, not before. xterm measures its
            //container to work out how many columns fit, and a container the
            //browser has not laid out yet measures zero — which gives a terminal
            //one column wide that never recovers on its own.
            try { f.fit(); } catch (e) { /* not laid out yet; the observer below gets it */ }

            var typed = onData ? t.onData(onData) : null;

            //RESIZED WITH ITS BOX, because the far end has to be told. A pty
            //that thinks it is 80 columns while the window is 200 wraps every
            //line in the wrong place, and the person reading it sees a terminal
            //that is subtly broken rather than one that is the wrong size.
            var watching = null;
            if (typeof ResizeObserver == 'function') {
                watching = new ResizeObserver(function () {
                    try { f.fit(); } catch (e) { /* mid-teardown */ }
                    if (onResize && t.cols && t.rows) onResize({ cols: t.cols, rows: t.rows });
                });
                watching.observe(host.current);
            }

            return function () {
                if (watching) watching.disconnect();
                if (typed) { try { typed.dispose(); } catch (e) { /* already gone */ } }
                term.current = null;
                fit.current = null;
                //DISPOSED, NOT LEFT. xterm attaches listeners and a canvas; a
                //pane that mounted one of these per selection would otherwise
                //leak a terminal per click. The same reason ../editor destroys
                //its ace instance.
                try { t.dispose(); } catch (e) { /* already gone */ }
            };
            //ONCE, AND ONLY ONCE. Everything that changes about a terminal
            //changes THROUGH it — bytes are written, the box is watched — so
            //rebuilding on a prop change would be throwing away scrollback to
            //apply something that did not need it.
        }, []);

        //RECOLOURED IN PLACE, NEVER REBUILT. Flipping the page from dark to
        //light must not throw away what a person is reading -- which is the same
        //argument as the ref-instead-of-a-prop above, and would be undone by
        //putting `look` in the dependency list of the effect that CREATES the
        //terminal. xterm takes a new theme at runtime, so this sets it.
        //
        //A FONT CHANGE MOVES THE CELL, so the columns have to be recounted after
        //one. A colour change does not, and refitting anyway is harmless.
        useEffect(function () {
            var t = term.current;
            if (!t || !wanted) return;

            if (wanted.theme) t.options.theme = wanted.theme;
            if (wanted.fontFamily) t.options.fontFamily = wanted.fontFamily;
            if (wanted.fontSize) t.options.fontSize = wanted.fontSize;

            try { if (fit.current) fit.current.fit(); } catch (e) { /* no box yet */ }
        }, [wanted]);

        useImperativeHandle(ref, function () {
            return {
                //WRITING IS ASYNCHRONOUS, AND THE CALLBACK IS PASSED THROUGH.
                //xterm parses and renders on its own schedule, so bytes handed
                //over here are not on the screen when this returns -- which is
                //invisible to a caller streaming output, and is the difference
                //between a test that measures the terminal and one that
                //measures the moment before it. It is also flow control: a
                //caller pushing faster than xterm can draw wants to know.
                write: function (bytes, done) {
                    if (term.current) term.current.write(bytes, done);
                    else if (done) done();
                },
                //CLEARED RATHER THAN REBUILT, for the same reason as above.
                clear: function (done) {
                    if (term.current) term.current.clear();
                    //clear() is synchronous but the repaint it causes is not,
                    //so it takes the same callback for the same reason
                    if (done) { if (term.current) term.current.write('', done); else done(); }
                },
                fit: function () { try { if (fit.current) fit.current.fit(); } catch (e) { /* no box yet */ } },
                focus: function () { if (term.current) term.current.focus(); },

                //WHAT IS ON THE SCREEN, ASKED OF THE TERMINAL RATHER THAN OF THE
                //DOM. xterm chooses its own renderer, and under the canvas one
                //the element's textContent is an accessibility buffer rather
                //than the screen -- so anything reading the DOM to find out what
                //a terminal says is reading an implementation detail that can
                //change under it. The buffer is the terminal's own answer.
                //
                //A caller copying the scrollback wants this too.
                text: function (options) {
                    var t = term.current;
                    if (!t) return '';

                    var buffer = t.buffer.active;
                    var from = (options && options.all) ? 0 : buffer.viewportY;
                    var to = (options && options.all) ? buffer.length : from + t.rows;

                    var out = [];
                    for (var i = from; i < to; i++) {
                        var line = buffer.getLine(i);
                        if (line) out.push(line.translateToString(true));
                    }
                    return out.join(String.fromCharCode(10));
                },
                get size() {
                    return term.current ? { cols: term.current.cols, rows: term.current.rows } : null;
                }
            };
        }, []);

        //THE BOX IS THE CALLER'S, AND IT MUST BE A DEFINITE ONE. xterm fills
        //whatever it is given, and this plugin has no opinion about how big a
        //terminal should be — a pane showing one console and a pane showing four
        //want different answers.
        //
        //WHAT IT MAY NOT BE IS CONTENT-SIZED. The observer above and xterm's own
        //fit feed each other if the height comes from the content: fit picks
        //rows, the rows make the box taller, the observer sees a taller box, fit
        //picks more rows. The theme's `.term` sets a height for exactly that
        //reason, and `height` here overrides it with another definite one —
        //which is why it is a value and not a flag: there is no "size yourself".
        return <div className="term" ref={host} style={height ? { height: height } : undefined} />;
    });

    await register(null, {
        xterm: {
            Term: Term,
            //THE PALETTES, HANDED OUT RATHER THAN COPIED. Anything that wants a
            //terminal-ish surface of its own should start from the same colours
            //rather than picking them again.
            //
            //`look(mode)` is what a page calls; LOOKS is there for a caller that
            //wants to build on one of them.
            look: look,
            LOOKS: LOOKS
        }
    });
}
module.exports = plugin;
