var React = require('react');
var { useRef, useState, useEffect } = React;

var marked = require('./vendor/marked/marked.js');

//---------------------------------------------------------------------------
//markdown, rendered where it cannot do anything.
//
//A PLUGIN WITH ITS OWN VENDOR FOLDER, like ../editor. `marked` belongs to one
//concern and nothing else in the app should be able to reach it by accident —
//it does not sanitise, and the safety of every use of it depends on the frame
//built here rather than on the caller remembering.
//
//IT PROVIDES THE FRAME AND NOTHING ELSE. The Rendered/Source toggle that sits
//around it is the theme's, because the buttons are; this owns the one part that
//must not be got wrong. Panes see neither — they ask the theme for <Markdown>
//and get something that is safe by construction.
//---------------------------------------------------------------------------

plugin.consumes = ['react'];
plugin.provides = ['markdown'];
async function plugin(imports, register) {
    //---- markdown, rendered where it cannot do anything -----------------------
    //
    //A PULL REQUEST BODY IS MARKDOWN THAT GITHUB WILL RENDER, so a preview of it
    //that is not rendered is a preview of the wrong thing. As source it is a wall
    //of pipes and hashes, and the one thing it was formatted for is the thing that
    //does not happen.
    //
    //IN AN IFRAME, AND THAT IS THE WHOLE DESIGN rather than a convenience for
    //styling. This text came off a machine running a script somebody wrote, so it
    //is exactly as trustworthy as that script — and markdown carries raw HTML
    //through BY DESIGN, which `marked` does not sanitise and has never claimed to.
    //Put in this document it would be running inside a page that has node behind it.
    //
    //So it renders into a frame that can do nothing:
    //
    //  no allow-scripts   a <script> or an onerror in the markdown never runs. This
    //                     is the load-bearing one, and both halves are measured in
    //                     the Kit pane rather than assumed.
    //  a CSP too          default-src 'none', so a remote <img> cannot phone home —
    //                     which would otherwise turn "somebody opened this" into a
    //                     request to a host of the author's choosing.
    //  srcdoc             no file is written anywhere to show it.
    //
    //What it does NOT have is an opaque origin — see the note on the sandbox
    //attribute below for why, and why that is survivable here and would not be if
    //scripts could run.
    //
    //THE COST OF A REAL SANDBOX is that this side cannot measure the frame to size
    //it, because reading contentDocument needs allow-same-origin. So it takes a
    //height and scrolls inside, which is what these panels do anyway.
    //TWO PALETTES, AND THE CALLER PICKS -- the same shape as ../xterm, and for
    //the same reason: this plugin knows nothing about the theme, so whoever does
    //know which mode is showing says so.
    //
    //A FRAME CANNOT INHERIT ANY OF THIS. Everything else in the app takes its
    //colours from the page around it; a document in an iframe has no page around
    //it, so the whole stylesheet has to be handed over. That is why this is two
    //complete palettes rather than a colour or two.
    var DARK = {
        scheme: 'dark',
        bg: '#0a0d12', text: '#d7dee8', heading: '#ffffff',
        line: '#2a323d', chip: '#161b22', link: '#4aa3ff', quiet: '#9aa6b5'
    };

    var LIGHT = {
        scheme: 'light',
        bg: '#ffffff', text: '#1f2328', heading: '#0b0c0e',
        line: '#d8dee4', chip: '#f2f4f6', link: '#0969da', quiet: '#57606a'
    };

    function styleFor(c) {
        return [
            ':root { color-scheme: ' + c.scheme + ' }',
            'body { margin: 0; padding: 14px 16px; background: ' + c.bg + '; color: ' + c.text + ';',
            '       font: 13px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }',
            'h1, h2, h3, h4 { color: ' + c.heading + '; line-height: 1.25; margin: 1.2em 0 .5em; }',
            'h1 { font-size: 1.5em; border-bottom: 1px solid ' + c.line + '; padding-bottom: .3em }',
            'h2 { font-size: 1.25em; border-bottom: 1px solid ' + c.line + '; padding-bottom: .3em }',
            'h1:first-child, h2:first-child, h3:first-child { margin-top: 0 }',
            'a { color: ' + c.link + ' }',
            'code { font-family: ui-monospace, Consolas, monospace; font-size: 12px;',
            '       background: ' + c.chip + '; padding: .15em .4em; border-radius: 4px }',
            'pre { background: ' + c.chip + '; border: 1px solid ' + c.line + '; border-radius: 8px;',
            '      padding: 12px; overflow-x: auto }',
            'pre code { background: none; padding: 0 }',
            'blockquote { margin: 0 0 1em; padding: .2em 0 .2em 14px; border-left: 3px solid ' + c.line + '; color: ' + c.quiet + ' }',
            'table { border-collapse: collapse; margin: 0 0 1em; display: block; overflow-x: auto }',
            'th, td { border: 1px solid ' + c.line + '; padding: 6px 10px; text-align: left }',
            'th { background: ' + c.chip + ' }',
            'hr { border: 0; border-top: 1px solid ' + c.line + '; margin: 1.5em 0 }',
            'img { max-width: 100% }',
            'ul, ol { padding-left: 22px }',
            'li { margin: .2em 0 }'
        ].join(String.fromCharCode(10));
    }

    //built once each, so a caller passing look(mode) does not hand the frame a
    //new srcdoc on every render
    var LOOKS = {
        dark: { colours: DARK, style: styleFor(DARK) },
        light: { colours: LIGHT, style: styleFor(LIGHT) }
    };

    //anything unrecognised is dark, because that is what this was before there
    //was a choice
    function look(mode) { return mode === 'light' ? LOOKS.light : LOOKS.dark; }

    function escapeBits(s) {
        return String(s).replace(/[<&]/g, function (c) { return c == '<' ? '&lt;' : '&amp;'; });
    }

    //FITTED TO THE DOCUMENT, when the caller asks for it. The frame is
    //same-origin -- there is no sandbox attribute, deliberately -- so this side
    //can read what the browser made of the document and does not have to guess
    //how tall it came out. `body` and not `documentElement`: in standards mode
    //the viewport propagates from the root element, so its scrollHeight is never
    //less than the box we set, and a fitted frame could then only ever grow.
    //The body is laid out to its content, so it answers the question asked.
    function measure(el) {
        if (!el) return 0;
        var doc = el.contentDocument;
        var body = doc && doc.body;
        return body ? body.scrollHeight || 0 : 0;
    }

    function MarkdownFrame({ text, height, fit, look: wanted }) {
        var skin = wanted || LOOKS.dark;
        var frame = useRef(null);
        var [tall, setTall] = useState(0);
        var body;
        try {
            body = marked.parse(String(text == null ? '' : text));
        } catch (e) {
            //SAID IN THE FRAME RATHER THAN THROWN, because the source view beside
            //it still works and is what somebody would fall back to anyway.
            body = '<p>This could not be rendered as markdown: ' + escapeBits(e.message) + '</p>';
        }
        //A TEMPLATE LITERAL BECAUSE THE CSP CONTAINS BOTH KINDS OF QUOTE, and a
        //policy that fails to parse fails OPEN in the sense that matters here: the
        //browser drops a malformed CSP and renders the frame with no policy at all,
        //which looks identical to a working one until the day the markdown contains
        //a remote image.
        var doc = `<!doctype html><html><head><meta charset="utf-8">`
            + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`
            + `<style>${skin.style}</style></head><body>${body}</body></html>`;

        //RE-MEASURED WHEN THE DOCUMENT CHANGES, AND AGAIN WHEN IT HAS PARSED.
        //A fresh `doc` string is a fresh srcdoc, which is a reload -- so
        //measuring from here reads the document on its way out. `onLoad` is what
        //settles the number; this covers `fit` being switched on over a document
        //that is already there, and owns the observer.
        useEffect(function () {
            if (!fit) { setTall(0); return; }
            setTall(measure(frame.current));

            //THE DOCUMENT RE-WRAPS WHEN THE FRAME GETS NARROWER and no load
            //event fires for that, so nothing else would ever notice. Measuring
            //the body rather than the root is also what keeps this from
            //oscillating: what it returns does not depend on the height we set
            //from it.
            if (typeof ResizeObserver != 'function') return;
            var watch = new ResizeObserver(function () { setTall(measure(frame.current)); });
            watch.observe(frame.current);
            return function () { watch.disconnect(); };
        }, [fit, doc]);

        //NO SANDBOX. THE CSP IS WHAT HOLDS, AND IT HOLDS BY ITSELF.
        //
        //`default-src 'none'` is not only about images. Every fetch directive falls
        //back to it, `script-src` included — so a <script> in the markdown has no
        //source it is allowed to execute from, and an inline `onerror=` needs
        //`script-src 'unsafe-inline'`, which is not granted either. The policy
        //refuses the code; the sandbox was refusing it a second time.
        //
        //WHICH IS WHY THE SANDBOX COULD GO. It was not free: `sandbox=""` renders
        //NOTHING in this NW.js build, silently — an empty box the size you asked
        //for, which reads as "there was nothing to show". Measured in the Kit pane,
        //five ways: plain srcdoc renders; adding sandbox="" blanks it; adding the
        //CSP as well blanks it; a data: URL instead blanks it; only
        //sandbox="allow-same-origin" rendered. So the choice was never
        //"sandbox or not" — it was which single restriction to keep.
        //
        //STILL AN IFRAME, AND THAT PART IS NOT NEGOTIABLE. This text came off a
        //machine running a script somebody wrote, and markdown carries raw HTML
        //through BY DESIGN — `marked` does not sanitise and has never claimed to.
        //In this document it would be inside a page that has node behind it. In a
        //frame with its own policy it is inert.
        //
        //AND IT IS ASSERTED RATHER THAN ASSUMED. The Markdown exhibit in the Kit
        //pane contains a real <script> and a real onerror in its markdown, with the
        //text they would overwrite written beside them. If the policy ever stops
        //holding, that exhibit says so on sight instead of a comment here claiming
        //it still does.
        //WIDTH AND BORDER ARE NOT DECORATION HERE. An iframe with nothing said
        //about it is 300px wide with a inset border, whatever box it is in --
        //so a rendered document came out as a narrow column with a frame drawn
        //round it. The plugin has to say this itself: the theme is a slot that
        //can be replaced, and a component that only lays out correctly under one
        //particular stylesheet is not self-contained.
        //AND `fit` MAKES THE HEIGHT THE DOCUMENT'S, with the one it was given as
        //the floor -- so a two-line document does not collapse to a strip and a
        //long one is not cut off at the bottom with nothing saying there is more.
        return <iframe className="md" ref={frame} srcDoc={doc}
            onLoad={function () { if (fit) setTall(measure(frame.current)); }}
            style={{
                width: '100%', border: 0, display: 'block',
                height: fit && tall ? Math.max(tall, height || 0) : (height || '60vh')
            }} />;
    }

    //ONLY THE FRAME. The Rendered/Source toggle beside it needs a Button, and
    //Button belongs to the theme — which consumes this. Composing the pair here
    //would make the cycle. So this owns the one thing that must not be got
    //wrong, and the theme owns the two buttons around it.
    await register(null, {
        markdown: {
            Frame: MarkdownFrame,

            //the palettes, handed out rather than copied, as ../xterm does
            look: look,
            LOOKS: LOOKS
        }
    });
}
module.exports = plugin;
