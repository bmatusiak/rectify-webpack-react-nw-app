var React = require('react');
var { useState, useEffect, useRef } = React;

//bootstrap's dashboard example: a toolbar, a chart, tiles and a table.
//
//the chart there is chart.js drawing seven numbers somebody typed. this one
//draws the memory of the process you are talking to, sampled over the socket,
//so the line moves because something is happening rather than because it was
//written down.

module.exports = function Dashboard(props) {
    var { theme, io, toast } = props;
    var { Section, Toolbar, Chart, Stats, Table, Button, Badge, Icon, Dropdown, Panel, Columns } = theme.ui;

    var [samples, setSamples] = useState([]);
    var [info, setInfo] = useState(null);
    var [live, setLive] = useState(true);
    var [every, setEvery] = useState(1000);
    var timer = useRef(null);

    useEffect(function () {
        function take() {
            io.emit('demo:info', {}, function (reply) {
                if (!reply) return;
                setInfo(reply);
                setSamples(function (list) {
                    return list.concat(Math.round(reply.memory / 1048576)).slice(-40);
                });
            });
        }

        take();
        if (!live) return;

        timer.current = setInterval(take, every);
        return function () { clearInterval(timer.current); };
    }, [live, every]);

    var latest = samples[samples.length - 1] || 0;
    var peak = samples.length ? Math.max.apply(null, samples) : 0;
    var floor = samples.length ? Math.min.apply(null, samples) : 0;

    return (
        <>
            <Toolbar title="Dashboard" actions={
                <>
                    <div className="btn-group me-2">
                        <Button size="sm" outline variant="secondary"
                            onClick={function () { setSamples([]); toast('history cleared', 'secondary'); }}>
                            Clear
                        </Button>
                        <Button size="sm" outline variant={live ? 'danger' : 'success'}
                            onClick={function () { setLive(!live); }}>
                            {live ? 'Pause' : 'Resume'}
                        </Button>
                    </div>
                    <Dropdown label={'every ' + (every / 1000) + 's'} variant="secondary" size="sm" outline
                        items={[500, 1000, 2000, 5000].map(function (ms) {
                            return {
                                label: 'every ' + (ms / 1000) + 's', active: every === ms,
                                onClick: function () { setEvery(ms); }
                            };
                        })} />
                </>
            } />

            <Section title="Memory, as it happens"
                lead={samples.length + ' samples, one every ' + (every / 1000) + 's'}
                aside={<Badge variant={live ? 'success' : 'secondary'} pill>{live ? 'live' : 'paused'}</Badge>}>
                <Chart data={samples} area variant="primary" height={200}
                    labels={samples.length > 1
                        ? ['oldest', Math.round(samples.length * every / 2000) + 's ago', 'now']
                        : []} />
            </Section>

            <Section title="Now" lead="the same numbers, read off the same reply">
                <Stats items={[
                    { label: 'memory', value: latest + ' MB', icon: 'memory', hint: 'resident' },
                    { label: 'peak', value: peak + ' MB', icon: 'graph-up', hint: 'this session' },
                    { label: 'floor', value: floor + ' MB', icon: 'graph-down', hint: 'this session' },
                    { label: 'uptime', value: info ? Math.round(info.uptime) + 's' : '—', icon: 'clock' }
                ]} />
            </Section>

            <Section title="Services" lead="what answered, and on which side">
              <Columns of={2}>
                <Panel title="The node half" lead="resolved on the server">
                    <Table small head={['Service', 'Kind']} className="mb-0">
                        {(info && info.services ? info.services : []).slice(0, 8).map(function (s) {
                            return (
                                <tr key={s.name}>
                                    <td className="fw-semibold">{s.name}</td>
                                    <td className="text-body-secondary">{s.kind}</td>
                                </tr>
                            );
                        })}
                    </Table>
                </Panel>

                <Panel title="This window" lead="resolved in the page">
                    <Table small head={['Service', 'Kind']} className="mb-0">
                        {Object.keys(props.services || {}).sort().slice(0, 8).map(function (name) {
                            return (
                                <tr key={name}>
                                    <td className="fw-semibold">{name}</td>
                                    <td className="text-body-secondary">{typeof props.services[name]}</td>
                                </tr>
                            );
                        })}
                    </Table>
                </Panel>
              </Columns>
            </Section>
        </>
    );
};
