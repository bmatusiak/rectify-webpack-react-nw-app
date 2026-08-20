var React = require('react');
var { useState, useEffect } = React;

//everything on this page is the app talking about itself. nothing is mocked:
//the numbers come off the socket, and the buttons reach the real window, the
//real tray and the real process.

module.exports = function System(props) {
    var { theme, io, appPackage, toast } = props;
    var { Section, Stats, Card, Button, Table, Badge, Alert, Icon, Progress } = theme.ui;

    var [info, setInfo] = useState(null);
    var [ping, setPing] = useState(null);
    var [tray, setTray] = useState([]);
    var [busy, setBusy] = useState(false);

    function refresh() {
        io.emit('demo:info', {}, function (reply) {
            setInfo(reply);
            setTray(reply.tray || []);
        });
    }

    useEffect(function () {
        refresh();
        var t = setInterval(refresh, 5000);
        return function () { clearInterval(t); };
    }, []);

    function roundTrip() {
        var started = Date.now();
        setBusy(true);
        io.emit('ping', {}, function (reply) {
            setPing({ ms: Date.now() - started, pid: reply.pid });
            setBusy(false);
            toast('round trip in ' + (Date.now() - started) + 'ms', 'success', 'arrow-repeat');
        });
    }

    function call(command, message) {
        io.emit(command, {}, function (reply) {
            refresh();
            toast(message || (reply && reply.ok ? 'done' : 'done'), 'primary', 'check2');
        });
    }

    return (
        <>
            <Section title="System" lead="the running app, over the socket it serves the window on">
                <Stats items={[
                    { label: 'pid', value: info ? info.pid : '—', icon: 'cpu' },
                    { label: 'uptime', value: info ? Math.round(info.uptime) + 's' : '—', icon: 'clock' },
                    { label: 'memory', value: info ? Math.round(info.memory / 1048576) + ' MB' : '—', icon: 'memory' },
                    { label: 'round trip', value: ping ? ping.ms + ' ms' : '—', icon: 'arrow-repeat' }
                ]} />
            </Section>

            <Section title="Controls" lead="each of these goes through a real service">
                <div className="d-flex flex-wrap gap-2 mb-3">
                    <Button icon="arrow-repeat" onClick={roundTrip} disabled={busy}>Ping the node half</Button>
                    <Button variant="secondary" icon="window-desktop"
                        onClick={function () { call('demo:hide', 'window hidden — reopen it from the tray'); }}>
                        Hide the window
                    </Button>
                    <Button variant="secondary" outline icon="browser-chrome"
                        onClick={function () { call('demo:browser', 'opened in your browser'); }}>
                        Open in browser
                    </Button>
                    <Button variant="secondary" outline icon="plus-lg"
                        onClick={function () { call('demo:tray-add', 'added a tray item'); }}>
                        Add a tray item
                    </Button>
                    <Button variant="secondary" outline icon="x-lg"
                        onClick={function () { call('demo:tray-clear', 'cleared the demo tray items'); }}>
                        Clear them
                    </Button>
                </div>

                <Alert variant="info" icon="info-circle">
                    Hiding the window leaves the app running behind its tray icon. Reopen it from
                    there, or with <code>npm start</code> again.
                </Alert>
            </Section>

            <Section title="Tray" lead="what is on the menu right now">
                {tray.length ? (
                    <Table small head={['Item']}>
                        {tray.map(function (label, i) {
                            return <tr key={i}><td><Icon name="dot" className="me-1" />{label}</td></tr>;
                        })}
                    </Table>
                ) : <p className="text-body-secondary">nothing yet</p>}
            </Section>

            <Section title="Build" lead="which of the three ways this one is">
                <Card>
                    <Table small>
                        <tr><td className="text-body-secondary">app</td><td>{appPackage.title} {appPackage.version}</td></tr>
                        <tr><td className="text-body-secondary">url</td><td><code>{info ? info.url : '—'}</code></td></tr>
                        <tr><td className="text-body-secondary">control socket</td><td><code>{info ? info.socket : '—'}</code></td></tr>
                        <tr>
                            <td className="text-body-secondary">packaged</td>
                            <td>{info ? <Badge variant={info.packaged ? 'primary' : 'secondary'}>
                                {info.packaged ? 'yes, running from main.bin' : 'no, running from source'}
                            </Badge> : '—'}</td>
                        </tr>
                    </Table>
                </Card>
            </Section>

            <Section title="Memory" lead="the same figure, drawn">
                <Progress value={info ? Math.min(100, info.memory / 1048576 / 5) : 0}
                    variant="info" striped animated label />
            </Section>
        </>
    );
};
