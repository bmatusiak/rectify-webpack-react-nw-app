var React = require('react');
var { useState, useEffect } = React;

//---------------------------------------------------------------------------
//a banner: something true about the app, said across the top of it.
//
//BOOTSTRAP HAS NO SUCH COMPONENT. It has an alert, which is an inline block
//with a margin and rounded corners meant to sit in a column of content; a
//toast, which goes away; and modals and offcanvases, which block the page.
//A bar under the title bar that stays until the thing it is about stops being
//true is none of those, and every app ends up building one.
//
//SO IT IS AN ALERT WITH ITS BOX MODEL FLATTENED, which is what bootstrap's own
//documentation site does with a hand-rolled `.bd-banner`. Using the alert means
//it inherits the pairing fix in ../theme -- an alert's colour and background are
//set together there, because several bootswatch builds override one and not the
//other -- so a banner is readable on all twenty-eight swatches from the first
//day rather than after somebody measures it.
//
//THIS CONSUMES THE THEME, AND THAT IS THE DIFFERENCE between this plugin and
//the four beside it. ../editor, ../markdown, ../xterm and ../litegraph wrap a
//vendored library and know nothing about the theme, because the theme is a slot
//somebody may replace. This is not a surface, it is a composition OF the kit --
//so it asks for the kit. Nothing in the theme consumes this back, so there is no
//cycle; if that ever changes, this is the plugin that has to move.
//
//A SERVICE AND A COMPONENT, NOT JUST A COMPONENT. What raises a banner is
//usually not what renders it: the node half failing to reload, a socket
//dropping, a swatch refusing the mode somebody asked for. So the list lives in
//the service and anything can add to it, and one <Banners/> somewhere renders
//whatever is there.
//---------------------------------------------------------------------------

plugin.consumes = ['react', 'theme'];
plugin.provides = ['banner'];
async function plugin(imports, register) {
    var { Alert, Icon } = imports.theme.ui;

    var showing = [];
    var watchers = [];
    var nextId = 1;

    function announce() {
        var now = showing.slice();
        watchers.slice().forEach(function (fn) {
            try { fn(now); }
            catch (e) { console.error('a banner watcher threw', e && e.stack || e); }
        });
    }

    //RAISING THE SAME ID TWICE REPLACES IT, rather than stacking a second copy.
    //A plugin saying something about a state it is watching will say it again
    //every time that state moves, and three copies of "the node half failed to
    //reload" is not three times as true.
    function raise(options) {
        options = options || {};
        var id = options.id || ('banner-' + (nextId++));

        var entry = {
            id: id,
            variant: options.variant || 'info',
            text: options.text,
            icon: options.icon,
            dismissible: !!options.dismissible,
            onDismiss: options.onDismiss
        };

        var at = showing.findIndex(function (b) { return b.id === id; });
        if (at >= 0) showing[at] = entry;
        else showing.push(entry);

        announce();
        return id;
    }

    //`lower()` with nothing named clears them all, which is what a page does
    //when it is done with whatever it was saying
    function lower(id) {
        var before = showing.length;
        showing = id === undefined ? [] : showing.filter(function (b) { return b.id !== id; });

        if (showing.length !== before) announce();
        return showing.length !== before;
    }

    function Banners({ className }) {
        var [items, setItems] = useState(showing.slice());

        //the list is the service's, not this component's: anything in the app
        //can add to it, and there may be more than one <Banners/> on screen
        useEffect(function () {
            setItems(showing.slice());
            return onChange(setItems);
        }, []);

        if (!items.length) return null;

        //A NAME ON THE STRIP ITSELF. Without one the only way to find a banner
        //is `.alert`, which also matches every alert in the page's content --
        //so nothing could tell "the app is saying something" from "this page
        //contains a notice", including a test.
        return (
            <div className={'app-banners' + (className ? ' ' + className : '')}>
                {items.map(function (b) {
                    return (
                        <Alert key={b.id} variant={b.variant}
                            //FLATTENED: no margin, no corners, no side borders.
                            //An alert is built to sit in a column; a banner is
                            //built to span one edge to the other.
                            className="mb-0 rounded-0 border-0 border-bottom py-2 px-3 d-flex align-items-center gap-2">
                            {b.icon ? <Icon name={b.icon} /> : null}
                            <span className="flex-grow-1 small">{b.text}</span>

                            {b.dismissible ? (
                                //OUR OWN BUTTON, NOT bootstrap's data-bs-dismiss.
                                //That one removes the element from the dom and
                                //tells nobody, so the service would still be
                                //holding a banner that is no longer on screen --
                                //and would put it back on the next render.
                                <button type="button" className="btn-close btn-close-sm"
                                    aria-label="Dismiss"
                                    onClick={function () {
                                        lower(b.id);
                                        if (b.onDismiss) b.onDismiss(b.id);
                                    }} />
                            ) : null}
                        </Alert>
                    );
                })}
            </div>
        );
    }

    function onChange(fn) {
        watchers.push(fn);
        return function () {
            var i = watchers.indexOf(fn);
            if (i >= 0) watchers.splice(i, 1);
        };
    }

    await register(null, {
        banner: {
            Banners: Banners,
            raise: raise,
            lower: lower,
            onChange: onChange,

            //a copy, because a caller that could splice this would be editing
            //what everything else is about to render
            list: function () { return showing.slice(); }
        }
    });
}
module.exports = plugin;
