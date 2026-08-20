var React = require('react');
var { useState, useEffect, useCallback } = React;

var pages = require('./pages');

//the demo shell: a sidebar, a page, and somewhere for toasts to land.
//
//delete this folder and the app is the scaffold again. everything here is
//built out of `theme.ui`, and everything it does goes through a real service —
//the stores remember, the socket answers, the tray and the window are the
//app's own.

plugin.consumes = ['app', 'react', 'theme', 'appPackage', 'io', 'config', 'session'];
plugin.provides = [];
async function plugin(imports, register) {
    var { react, theme, appPackage, io, config, session } = imports;
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
                        config={config} session={session} toast={toast} open={open}
                        services={imports.app.services} />
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
