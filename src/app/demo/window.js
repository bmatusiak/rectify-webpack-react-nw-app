var React = require('react');
var { useState, useEffect, useCallback } = React;

var pages = require('./pages');

//the demo shell: a sidebar, a page, and somewhere for toasts to land.
//
//delete this folder and the app is the scaffold again. everything here is
//built out of `theme.ui`, and everything it does goes through a real service —
//the stores remember, the socket answers, the tray and the window are the
//app's own.

//THE FOUR VENDORED SURFACES ARE CONSUMED HERE RATHER THAN BY THE THEME.
//Each has a page that shows what it is for, and the demo is the thing that
//shows what things are for. Hanging them off the theme instead would make the
//theme -- which the README calls a slot you are expected to replace -- fail to
//load if you deleted one of them.
plugin.consumes = ['app', 'react', 'theme', 'appPackage', 'io', 'settings', 'session',
    'editor', 'markdown', 'xterm', 'litegraph', 'ext', 'banner'];
plugin.provides = [];
async function plugin(imports, register) {
    var { react, theme, appPackage, io, settings, session, banner } = imports;
    var { Page, Sidebar, Navbar, Footer, Button, Icon, Toasts } = theme.ui;

    //which page you were on survives a reload, because it is in the store
    var ui = session('demo.ui', { page: pages[0].id });

    function Demo() {
        var [page, setPage] = useState(ui.page);
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
            setPage(id);
            ui.page = id;//the store writes through on assignment
        }

        function jump(id) {
            var el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        //the window's own title, which is also what the tray tooltip and the
        //taskbar show
        useEffect(function () {
            var current = pages.filter(function (p) { return p.id === page; })[0];
            document.title = appPackage.title + (current ? ' | ' + current.label : '');
        }, [page]);

        var current = pages.filter(function (p) { return p.id === page; })[0] || pages[0];
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
                            <Sidebar items={pages} active={page} onSelect={open}
                                className="app-sidebar d-none d-md-flex"
                                sections={sections} onJump={jump}
                                footer={<span>{pages.length} pages, all live</span>} />
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
                    <Body theme={theme} io={io} appPackage={appPackage}
                        settings={settings} session={session} toast={toast} open={open}
                        services={imports.app.services} plugins={imports.app.plugins}
                        ext={imports.ext}
                        editor={imports.editor} markdown={imports.markdown}
                        xterm={imports.xterm} litegraph={imports.litegraph} />
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
