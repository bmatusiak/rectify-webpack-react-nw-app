//IS THIS FRAME THE PAGE, OR SOMETHING INSIDE IT.
//
//`document-start` AND `document-end` FIRE FOR EVERY FRAME, IFRAMES INCLUDED, and
//the object handed over is that frame's Window either way. The demo's Markdown
//page renders into a `srcdoc` iframe, and main repointed at it -- so the bridge
//was attached to a frame with none of the app in it, `__host` was never injected
//where it was needed, the page could not find the bridge, fell through to
//socket.io, and was refused by a viewer that is off. That surfaced as the window
//reporting itself a browser, four steps from the cause.
//
//A MODULE BECAUSE IT COULD NOT BE REACHED OTHERWISE. It was a closure inside the
//setup function of a plugin that needs nw to load, so nothing could ask it
//anything -- and its own sabotage proved that by surviving: ./main.js was broken
//on purpose and every check still passed, because none of them could see this.
//
//Same shape as ../may/deciding.js and ../events/keeping.js: the part that must
//be right, answerable in a millisecond without an app.

//`own` is the window main was handed, when there is one. It is passed rather
//than reached for so this file knows nothing about nw.
module.exports = function isTop(frame, own) {
    if (!frame) return false;

    //THE CHEAP ANSWER FIRST, AND IT CAN ONLY BE A TRUE POSITIVE. If this frame
    //IS the window's own, it is the top one. A stale `win.window` -- which is
    //what it is during document-start for a reload -- is a different object, so
    //it says false rather than lying.
    //
    //Asking it first also keeps chromium quiet: reading `frame.parent` in a
    //packaged build is met with "Cross-Origin-Opener-Policy policy would block
    //the window.parent call" every time, warned into a log somebody is trying to
    //read.
    try { if (own && frame === own) return true; }
    catch (e) { /* cannot even compare: ask the frame instead */ }

    //A TOP-LEVEL DOCUMENT IS ITS OWN PARENT. An iframe's parent is the page
    //holding it.
    try { return frame.parent === frame; }
    catch (e) { /* refused: fall through */ }

    //AND WHEN CHROMIUM REFUSES TO ANSWER. In a packaged build reading
    //`frame.parent` is met with the same COOP warning -- not a throw that says
    //what it wants, and the frame is left unclassified.
    //
    //Neither would answer, so it is not ours to inject into. Without this pair
    //the packaged window was classified as not-top, skipped injection at
    //document-start, and worked only because `loaded` puts the way home back
    //afterwards. Working by luck is not the same as working.
    return false;
};
