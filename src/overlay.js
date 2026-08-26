//a failure with no window to look at is the expensive kind. anything that goes
//wrong before or underneath the ui gets printed on top of the page.

var ID = 'app-error-overlay';

module.exports = function showError(title, detail) {
    //AND SAID OUT LOUD, BECAUSE A PICTURE IS NOT A CHECK.
    //
    //This drew a red box on the window and did nothing else, so the only way to
    //find out the app had failed was to LOOK at it. `npm run check` bundles a
    //free identifier happily, every suite passes against the last good bundle,
    //and `npm run log` shows nothing -- so the whole toolchain reads green while
    //the app is face down.
    //
    //Two exits now, and neither needs anybody to look:
    //  console      into nw.log, so `npm run log` has it and it is greppable
    //  the DOM      tools/drive.js fails on it before it measures anything else
    if (typeof console != 'undefined' && console.error) {
        console.error('[app-error] ' + title, (detail && detail.stack) || detail || '');
    }

    if (typeof document == 'undefined') return;

    var pre = document.getElementById(ID);

    if (!pre) {
        pre = document.createElement('pre');
        pre.id = ID;
        pre.style.cssText = 'position:relative;z-index:9999;margin:0;padding:1rem;' +
            'white-space:pre-wrap;font:12px/1.5 monospace;color:#fff;background:#b00';
        document.body.insertBefore(pre, document.body.firstChild);
    }

    pre.textContent = title + '\n\n' + ((detail && detail.stack) || detail || '');
};

//---- AND IT COMES DOWN AGAIN ---------------------------------------------
//
//IT NEVER DID, AND THAT IS THE OTHER HALF OF THE SAME FAULT. Once drawn this
//stayed drawn -- so a reload that FIXED the problem left the red box in place,
//and everything reading it went on reporting an app that was already back up.
//
//WHICH IS WORSE THAN NOT REPORTING AT ALL. A check that says "down" while the
//app is up gets ignored the second time it does it, and then it is not a check
//any more.
//
//src/app/core/build/main.js says `server:ok` on every reload that worked, and
//this is what that clears. It is only ever raised for a SERVER failure with the
//window still up -- a window that fails to boot is replaced wholesale by the
//next reload, which takes the overlay with it.
module.exports.clear = function () {
    if (typeof document == 'undefined') return false;

    var pre = document.getElementById(ID);
    if (!pre || !pre.parentNode) return false;

    pre.parentNode.removeChild(pre);
    return true;
};

//WHETHER THE APP IS SAYING IT IS BROKEN, for anything that wants to ask rather
//than draw.
//
//IT TAKES A DOCUMENT, AND THAT IS THE WHOLE POINT. The window can ask about its
//own, and MAIN can ask about the window's -- src/app/core/bridge/main.js holds
//the page's real Window object, injected at document-start before any plugin
//runs. Main is the only half that can still answer when every window plugin is
//dead AND when the node half is gone, which is exactly when somebody wants to
//know.
//
//THE ID STAYS IN THIS FILE. A caller that reached for `getElementById` itself
//would be a second place that knows what the overlay is called, and the two
//would drift the first time it was renamed.
module.exports.showing = function (doc) {
    var where = doc || (typeof document == 'undefined' ? null : document);
    if (!where) return null;

    var pre = where.getElementById(ID);
    return pre ? pre.textContent : null;
};

module.exports.ID = ID;
