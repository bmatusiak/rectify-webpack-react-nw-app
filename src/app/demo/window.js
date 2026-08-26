var React = require('react');
var { useState, useEffect, useCallback } = React;

var ownPages = require('./pages');

//NOTHING HERE IS A MOCK, and that is the expensive choice. A demo built on
//canned data renders the same and is finished in a day; this one goes through
//the real services, so every page is also a test of them -- and when a service
//breaks, the demo breaks with it rather than continuing to look correct. The
//stores remember, the socket answers, the tray and the window are the app's own.
//
//DELETE THIS FOLDER AND THE APP IS THE SCAFFOLD AGAIN, which is what keeps that
//affordable: it is one directory, it provides nothing, and nothing consumes it.

//THE FOUR VENDORED SURFACES ARE CONSUMED HERE RATHER THAN BY THE THEME.
//Each has a page that shows what it is for, and the demo is the thing that
//shows what things are for. Hanging them off the theme instead would make the
//theme -- which the README calls a slot you are expected to replace -- fail to
//load if you deleted one of them.
plugin.consumes = ['app', 'react', 'theme', 'appPackage', 'io', 'preferences', 'session',
    'editor', 'markdown', 'xterm', 'litegraph', 'ext', 'banner', 'pages', 'remember'];
plugin.provides = [];
async function plugin(imports, register) {
    var { react, theme, appPackage, io, preferences, session, banner, pages, remember } = imports;
    var { Page, Sidebar, Navbar, Footer, Button, Icon, Toasts } = theme.ui;

    //EVERYTHING THIS PAGE NEEDS THAT THE SHELL CANNOT PASS, gathered once. The
    //demo's pages take a dozen services between them; a page registered by
    //another plugin takes whatever ITS plugin consumed. So the bag is closed
    //over here rather than handed down by ../core/pages, which would otherwise
    //have to know what a page might want -- and every new page would widen a
    //type nobody owns.
    var bag = {
        theme: theme, io: io, appPackage: appPackage, preferences: preferences, session: session,
        services: imports.app.services, plugins: imports.app.plugins, ext: imports.ext,
        editor: imports.editor, markdown: imports.markdown,
        xterm: imports.xterm, litegraph: imports.litegraph
    };

    //REGISTERED RATHER THAN RENDERED FROM THE FILE. ./pages/index.js is still
    //the demo's own list, in its own order; what changed is that the sidebar is
    //now drawn from the SERVICE, so a plugin in app_plugins can put a page
    //beside these without editing a line of the demo.
    ownPages.forEach(function (one, at) {
        pages.add({
            id: one.id, label: one.label, icon: one.icon, order: at,
            Page: function (props) { return React.createElement(one.Page, Object.assign({}, bag, props)); }
        });
    });

    //THE OLD KEY IS TAKEN OUT RATHER THAN LEFT TO ROT. The open page lived in
    //`session` until ../core/remember arrived, and sessionStorage survives a
    //reload -- so without this the window carries a dead page id around for as
    //long as it is open, and core/remember's own test cannot tell that apart
    //from the demo still writing there. Moving a stored value leaves the old
    //one behind; nothing collects it.
    try { sessionStorage.removeItem('demo.ui'); } catch (e) { /* no storage, nothing to clean */ }

    function Demo() {
        //THE LIST IS THE SERVICE'S, and it can change while the app is open --
        //a plugin reloading re-registers its page. The hook is ../core/pages's
        //so that a shell does not have to know that, and the one that forgot
        //would draw a sidebar that never noticed a page arriving.
        var showing = pages.usePages();

        //WHICH PAGE YOU WERE ON SURVIVES A RESTART, not merely a reload. This
        //was `session`, which dies with the window -- and the window dying is
        //the case worth surviving: every change to src/main.js needs a restart,
        //and a packaged app gets one every launch. ../core/remember is the same
        //shape as useState precisely so this line could stop being one.
        var [page, setPage] = remember.use('demo.ui', 'page', pages.list[0].id);
        var [mode, setMode] = useState(theme.mode);
        var [swatch, setSwatch] = useState(theme.swatch);
        var [toasts, setToasts] = useState([]);
        var [connected, setConnected] = useState(io.connected !== false);

        useEffect(function () { return theme.onModeChange(setMode); }, []);

        //TWO BANNERS THIS APP CAN HONESTLY RAISE, both about state it already
        //had and was saying quietly or not at all.
        //
        //A swatch that refuses the mode was a disabled toggle with a tooltip --
        //true, and only findable by hovering the control that is not working.
        //A dropped socket was a coloured dot in the footer, which is the thing
        //this app already learned the hard way: a page whose socket is dead
        //looks exactly like a working one until you click something.
        useEffect(function () {
            if (theme.modeLocked) banner.raise({
                id: 'mode-locked',
                variant: 'warning',
                icon: 'circle-half',
                text: theme.swatch + ' is a ' + theme.showing + ' design, so ' + theme.mode +
                    ' mode cannot be honoured. Pick another swatch to change it.'
            });
            else banner.lower('mode-locked');
        }, [mode, swatch]);

        useEffect(function () {
            if (connected) banner.lower('offline');
            else banner.raise({
                id: 'offline',
                variant: 'danger',
                icon: 'plug',
                text: 'not connected to the node half. nothing on this page can reach the app.'
            });
        }, [connected]);

        useEffect(function () {
            var up = function () { setConnected(true); };
            var down = function () { setConnected(false); };
            io.on('connect', up);
            io.on('disconnect', down);
            return function () { io.off('connect', up); io.off('disconnect', down); };
        }, []);

        var toast = useCallback(function (message, variant, icon) {
            var id = Date.now() + Math.random();
            setToasts(function (list) { return list.concat({ id: id, message: message, variant: variant, icon: icon }); });
            setTimeout(function () {
                setToasts(function (list) { return list.filter(function (t) { return t.id !== id; }); });
            }, 4000);
        }, []);

        function open(id) {
            setPage(id);//and remembers, because it is remember's setter
        }

        function jump(id) {
            var el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        //the window's own title, which is also what the tray tooltip and the
        //taskbar show
        useEffect(function () {
            var current = showing.filter(function (p) { return p.id === page; })[0];
            document.title = appPackage.title + (current ? ' | ' + current.label : '');
        }, [page, showing]);

        var current = showing.filter(function (p) { return p.id === page; })[0] || showing[0];
        if (!current) return null;//nothing has registered a page yet
        var Body = current.Page;

        return (
            <>
                <Page
                    banner={<banner.Banners />}
                    header={
                        <Navbar brand={<span><Icon name="box-seam" className="me-2" />{appPackage.title}</span>}
                            right={
                                <div className="d-flex align-items-center gap-2">
                                    <select className="form-select form-select-sm" style={{ width: '9rem' }}
                                        value={swatch} aria-label="Theme"
                                        onChange={function (e) {
                                            setSwatch(theme.setSwatch(e.target.value));
                                        }}>
                                        {theme.swatches.map(function (name) {
                                            return <option key={name} value={name}>{name}</option>;
                                        })}
                                    </select>
                                    <Button size="sm" outline variant="secondary"
                                        icon={mode === 'dark' ? 'sun' : 'moon-stars'}
                                        disabled={theme.modeLocked}
                                        title={theme.modeLocked
                                            ? swatch + ' is a ' + mode + ' design, so there is no other way to wear it'
                                            : 'switch between light and dark'}
                                        onClick={function () { theme.themeSwitcher(); }}>
                                        {mode === 'dark' ? 'Light' : 'Dark'}
                                    </Button>
                                </div>
                            } />
                    }
                    sidebar={function (sections) {
                        return (
                            <Sidebar items={showing} active={page} onSelect={open}
                                className="app-sidebar d-none d-md-flex"
                                sections={sections} onJump={jump}
                                footer={<span>{showing.length} pages, all live</span>} />
                        );
                    }}
                    footer={
                        <Footer
                            left={
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Icon name={connected ? 'plug-fill' : 'plug'}
                                        className={connected ? 'text-success' : 'text-danger'} />
                                    <span>{connected ? 'connected' : 'offline'}</span>
                                    <span className="opacity-50">{location.host}</span>
                                </span>
                            }
                            right={<span>{appPackage.name} {appPackage.version}</span>} />
                    }>
                    {/* WHAT THE SHELL PASSES IS THE SHELL'S TO GIVE: where to go, and
                        how to say something. Everything else a page needs it gets from
                        the plugin that registered it -- see the bag above. That cut is
                        what lets a page come from a tree the demo has never heard of. */}
                    <Body open={open} toast={toast} />
                </Page>

                <Toasts items={toasts} onDismiss={function (id) {
                    setToasts(function (list) { return list.filter(function (t) { return t.id !== id; }); });
                }} />
            </>
        );
    }

    react.root.render(<Demo />);

    await register(null, {});
}
module.exports = plugin;
