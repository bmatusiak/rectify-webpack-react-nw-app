var { createRoot } = require('react-dom/client');

//PUTTING A COMPONENT ON THE SCREEN SO A TEST CAN LOOK AT IT.
//
//Only the window context can use this, which is why it is required by
//./window.js and not by ./suites.js.
//
//IT MOUNTS INTO THE REAL DOCUMENT, NOT A DETACHED NODE, and that is the whole
//reason it exists rather than each test doing three lines itself. Every surface
//in src/app/ui measures its own box to lay out: xterm counts how many character
//cells fit, ace counts its rows after wrapping, litegraph sizes a canvas. A
//detached div has no box, so all three would render nothing and every assertion
//about them would be about the wrong thing -- and pass, if it were written
//carelessly.
//
//OFF SCREEN, NOT DISPLAY:NONE. `display: none` has no box either. Absolute
//positioning far off the left edge is laid out, painted and measurable, and is
//not visible in a screenshot somebody takes while the suite is running.

var OFFSCREEN = {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '900px',
    height: '400px'
};

//two frames: one for react to commit, one for the layout it caused. A single
//frame catches the commit and misses the measurement that follows it, which is
//exactly the half a component like xterm needs.
function painted() {
    return new Promise(function (resolve) {
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
}

module.exports = async function mount(element, options) {
    var host = document.createElement('div');
    Object.keys(OFFSCREEN).forEach(function (key) { host.style[key] = OFFSCREEN[key]; });
    if (options && options.width) host.style.width = options.width;
    if (options && options.height) host.style.height = options.height;

    document.body.appendChild(host);

    var root = createRoot(host);
    root.render(element);

    await painted();
    if (options && options.settle) await options.settle();

    return {
        el: host,

        //A FIXED NUMBER OF FRAMES IS NOT A RESULT. Two frames is enough for
        //these components on an idle machine and not enough when the whole
        //suite is running -- ace attached on its own schedule and the editor
        //test failed only in the full run, which is the worst way to find out.
        //So a test that needs something to have happened waits for THAT.
        until: async function (predicate, why, tries) {
            for (var i = 0; i < (tries || 60); i++) {
                if (predicate()) return true;
                await painted();
            }
            throw new Error(why || 'it never happened');
        },
        //RE-RENDER INTO THE SAME ROOT, which is what a page does when a prop
        //changes. Mounting a second time instead would build a second component
        //and prove nothing about the first surviving.
        render: function (next) { root.render(next); },

        find: function (selector) { return host.querySelector(selector); },
        all: function (selector) { return Array.prototype.slice.call(host.querySelectorAll(selector)); },
        painted: painted,

        //UNMOUNTED BY THE TEST, ALWAYS. Three of the four surfaces here hold
        //something that outlives their element if nobody says otherwise -- ace
        //binds window resize, xterm a canvas and listeners, litegraph a
        //requestAnimationFrame loop. A suite that leaked one per test would
        //leave the app slower every time it ran.
        unmount: function () {
            try { root.unmount(); } catch (e) { /* already gone */ }
            if (host.parentNode) host.parentNode.removeChild(host);
        }
    };
};
