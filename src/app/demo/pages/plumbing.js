var React = require('react');
var { useState, useEffect, useCallback } = React;

//THE PLUMBING: what the node half keeps, and where.
//
//NONE OF THESE SERVICES ARE REACHABLE FROM HERE, and that is as much of the
//lesson as the content. `dataDir`, `state`, `secret`, `log` and `cron` live on
//the node side, so this page asks over the socket exactly as the System page
//asks for a pid. A page is a view of the app, not a second copy of it.
//
//NOTHING HERE IS A MOCK. The paths are the real ones, the sealed file is really
//sealed, the log lines really went into the app's log, and the jobs are the ones
//the clock is really turning. A screenshot of invented paths would teach
//somebody the wrong folder.

module.exports = function Plumbing(props) {
    var { theme, io, toast } = props;
    var { Section, Card, Button, Badge, Input, Table, Alert, Icon } = theme.ui;

    var [where, setWhere] = useState(null);
    var [note, setNote] = useState('');
    var [kept, setKept] = useState(null);
    var [secret, setSecret] = useState(null);
    var [said, setSaid] = useState({ lines: [], tags: [] });
    var [jobs, setJobs] = useState([]);

    var ask = useCallback(function (what, data) {
        return new Promise(function (resolve) { io.emit(what, data || {}, resolve); });
    }, [io]);

    var refresh = useCallback(async function () {
        setWhere(await ask('demo:plumbing'));
        setKept(await ask('demo:kept'));
        setSecret(await ask('demo:sealed'));
        setJobs((await ask('demo:jobs')).jobs || []);
    }, [ask]);

    useEffect(function () { refresh(); }, [refresh]);

    //THE LOG IS PULLED WITH `since`, WHICH IS WHAT IT IS FOR: ask for everything
    //after what you already have and you can neither miss a line nor draw one
    //twice. core/log answers an id from a log that no longer exists with
    //everything rather than nothing, so a restart shows up as a refill instead
    //of as silence.
    useEffect(function () {
        var gone = false;
        var newest = 0;

        async function pull() {
            var out = await ask('demo:said', { since: newest });
            if (gone || !out || !out.lines) return;

            if (out.lines.length) newest = out.lines[out.lines.length - 1].id;

            setSaid(function (had) {
                return { lines: had.lines.concat(out.lines).slice(-40), tags: out.tags || [] };
            });
        }

        pull();
        var timer = setInterval(pull, 2000);

        return function () { gone = true; clearInterval(timer); };
    }, [ask]);

    return (
        <>
            <Section title="Where it all lives"
                lead="Worked out once, from the name in package.json.">

                {where ? (
                    <Table small responsive head={['what', 'where']}>
                        <tr><td className="fw-semibold">dataDir</td><td><code>{where.dataDir.path}</code></td></tr>
                        <tr><td className="fw-semibold">derived from</td><td><code>{where.dataDir.from}</code></td></tr>
                        <tr><td className="fw-semibold">state</td><td><code>{where.state.where}</code></td></tr>
                        <tr><td className="fw-semibold">secret</td><td><code>{where.secret.where}</code></td></tr>
                    </Table>
                ) : <p className="text-body-secondary">asking...</p>}

                <Alert variant="warning" className="d-flex align-items-start gap-2 mt-3">
                    <Icon name="exclamation-triangle" className="mt-1" />
                    <span>
                        Rename the app in <code>package.json</code> and every one of those moves,
                        silently — along with the control socket and <code>localStorage</code>.
                        It reads as <em>the app forgot my settings</em>.
                    </span>
                </Alert>
            </Section>

            <Section title="Kept between restarts"
                lead="core/state — the app's own things, on disk. Not the person's; that is preferences.">

                <div className="row g-3 align-items-end">
                    <div className="col-sm-8">
                        <Input id="plumbing-note" label="A note the app will still have tomorrow"
                            value={note} onChange={function (e) { setNote(e.target.value); }}
                            placeholder={(kept && kept.note) || 'nothing kept yet'} />
                    </div>
                    <div className="col-sm-4 d-flex gap-2">
                        <Button variant="primary" icon="save" onClick={async function () {
                            setKept(await ask('demo:kept', { write: note }));
                            if (toast) toast('written, and renamed into place', 'success', 'save');
                        }}>Keep it</Button>

                        <Button outline variant="secondary" icon="trash" onClick={async function () {
                            setKept(await ask('demo:kept', { forget: true }));
                            setNote('');
                        }}>Forget</Button>
                    </div>
                </div>

                {kept ? (
                    <p className="text-body-secondary small mt-3 mb-0">
                        {kept.note
                            ? <>Now holding <Badge variant="primary">{kept.note}</Badge> in <code>{kept.path}</code></>
                            : <>Nothing kept, so reading it answers the fallback — which is not the same as an empty document.</>}
                    </p>
                ) : null}
            </Section>

            <Section title="Kept so the file is not enough"
                lead="core/secret — DPAPI on windows, file permissions elsewhere, and it says which.">

                <div className="d-flex flex-wrap gap-2 mb-3">
                    <Button variant="primary" icon="lock" onClick={async function () {
                        setSecret(await ask('demo:sealed', { keep: 'a-token-worth-keeping' }));
                        if (toast) toast('sealed', 'success', 'lock');
                    }}>Keep a secret</Button>

                    <Button outline variant="secondary" icon="trash"
                        disabled={!(secret && secret.kept)}
                        onClick={async function () { setSecret(await ask('demo:sealed', { forget: true })); }}>
                        Forget it
                    </Button>
                </div>

                {secret && secret.error ? <Alert variant="danger">{secret.error}</Alert> : null}

                {secret && secret.kept ? (
                    <Card title="What is on disk"
                        subtitle={secret.sealed
                            ? 'sealed — this is not the value'
                            : 'not sealed — this platform cannot, and says so rather than pretending'}>

                        <pre className="mb-2"><code>{secret.onDisk}...</code></pre>

                        <p className="mb-0">
                            Opened back:{' '}
                            <Badge variant={secret.sealed ? 'success' : 'warning'}>{secret.value}</Badge>
                        </p>
                    </Card>
                ) : (
                    <p className="text-body-secondary mb-0">
                        Nothing kept. This machine {secret && secret.can ? 'can' : 'cannot'} seal.
                    </p>
                )}
            </Section>

            <Section title="On a timer"
                lead={'core/cron — one timer for the whole app, beating every ' +
                    ((where && where.cron && where.cron.beat) || '?') + 'ms.'}>

                {jobs.length ? (
                    <Table hover responsive small head={['job', 'what it is for', 'every', 'state', 'last run', '']}>
                        {jobs.map(function (one) {
                            return (
                                <tr key={one.name}>
                                    <td className="fw-semibold">{one.name}</td>
                                    <td className="text-body-secondary">{one.about || '—'}</td>
                                    <td>{Math.round(one.every / 1000)}s</td>
                                    <td>{one.running
                                        ? <Badge variant="success">running</Badge>
                                        : <Badge variant="secondary">stopped</Badge>}</td>
                                    <td className="small text-body-secondary">{one.lastAt
                                        ? (one.lastOk ? one.lastMs + 'ms' : 'failed: ' + one.lastWhy)
                                        : 'never'}</td>
                                    <td>
                                        <span className="d-inline-flex gap-1">
                                            <Button size="sm" outline variant="secondary"
                                                onClick={async function () {
                                                    setJobs((await ask('demo:jobs',
                                                        one.running ? { stop: one.name } : { start: one.name })).jobs || []);
                                                }}>{one.running ? 'Stop' : 'Start'}</Button>

                                            <Button size="sm" outline variant="primary"
                                                onClick={async function () {
                                                    setJobs((await ask('demo:jobs', { fire: one.name })).jobs || []);
                                                    if (toast) toast('ran ' + one.name + ' now', 'info', 'play');
                                                }}>Run now</Button>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </Table>
                ) : (
                    <p className="text-body-secondary mb-0">
                        Nothing is scheduled. A plugin describes a job with <code>cron.add</code> and
                        supplies the work with <code>cron.does</code> — see <code>src/app/example</code>.
                    </p>
                )}
            </Section>

            <Section title="What the app has been saying"
                lead="core/log — tagged, kept in main so a save does not empty it, redacted on the way in.">

                <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                    <Button variant="primary" icon="chat-left-text" onClick={function () {
                        ask('demo:said', { say: 'hello from the Plumbing page' });
                    }}>Say something</Button>

                    {/* THE REDACTION, DEMONSTRATED RATHER THAN DESCRIBED. This really
                        does send a token-shaped string into the app's own log, and what
                        comes back is what everything else would have seen. */}
                    <Button outline variant="danger" icon="shield-lock" onClick={function () {
                        ask('demo:said', { say: 'cloning with ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
                        if (toast) toast('sent a credential to the log — watch what arrives', 'warning', 'shield-lock');
                    }}>Send a credential</Button>

                    {(said.tags || []).slice(0, 6).map(function (t) {
                        return <Badge key={t.tag} variant="secondary">{t.tag} {t.n}</Badge>;
                    })}
                </div>

                {said.lines.length ? (
                    <pre className="mb-0" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                        <code>{said.lines.map(function (one) {
                            return '[' + one.tags.join(' ') + '] ' + one.text;
                        }).join('\n')}</code>
                    </pre>
                ) : <p className="text-body-secondary mb-0">nothing yet</p>}
            </Section>

            <Section title="Carried across the reload"
                lead="core/handover — the box core carries without looking inside.">

                <p className="mb-0">
                    {where && where.handedOver && where.handedOver.length
                        ? <>Being carried: {where.handedOver.map(function (n) {
                            return <Badge key={n} variant="primary" className="me-1">{n}</Badge>;
                        })}</>
                        : <span className="text-body-secondary">
                            Nothing — which is the honest answer here. The container exists so a plugin
                            outside <code>core</code> never has to edit <code>core/build</code> to keep
                            something across a save.
                        </span>}
                </p>
            </Section>
        </>
    );
};
