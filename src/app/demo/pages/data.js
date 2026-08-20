var React = require('react');
var { useState, useMemo, useEffect } = React;

//a table doing what a table is for: search, sort, paginate. the rows are the
//app's own service graph — both halves of it — so the page has real content
//and stays true in a packaged build, where there is no source tree to read.

module.exports = function Data(props) {
    var { theme, io } = props;
    var { Section, Table, Input, Badge, Pagination, ListGroup, ListItem, Breadcrumb, Card, Icon, Alert } = theme.ui;

    var [rows, setRows] = useState([]);
    var [query, setQuery] = useState('');
    var [sort, setSort] = useState({ key: 'name', dir: 1 });
    var [page, setPage] = useState(1);
    var perPage = 8;

    useEffect(function () {
        io.emit('demo:services', {}, function (server) {
            var here = props.services || {};
            var mine = Object.keys(here).sort().map(function (name) {
                return { name: name, side: 'window', kind: typeof here[name], keys: '' };
            });
            setRows((server || []).concat(mine));
        });
    }, []);

    var filtered = useMemo(function () {
        var q = query.toLowerCase();
        var out = rows.filter(function (r) {
            return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.side.indexOf(q) >= 0;
        });
        return out.slice().sort(function (a, b) {
            var x = String(a[sort.key] || ''), y = String(b[sort.key] || '');
            return x < y ? -sort.dir : x > y ? sort.dir : 0;
        });
    }, [rows, query, sort]);

    var pages = Math.max(1, Math.ceil(filtered.length / perPage));
    var shown = filtered.slice((page - 1) * perPage, page * perPage);

    function by(key) {
        return function () {
            setSort({ key: key, dir: sort.key === key ? -sort.dir : 1 });
            setPage(1);
        };
    }

    function head(key, label) {
        return (
            <a role="button" className="text-decoration-none" onClick={by(key)}>
                {label} {sort.key === key ? <Icon name={sort.dir > 0 ? 'caret-up-fill' : 'caret-down-fill'} /> : null}
            </a>
        );
    }

    return (
        <>
            <Section title="Data" lead="the services this app resolved, from both graphs"
                aside={<Badge pill variant="secondary">{filtered.length} of {rows.length}</Badge>}>

                <Breadcrumb className="mb-3" items={[{ label: 'rectify' }, { label: 'services' }, 'resolved']} />

                <Input id="d-search" placeholder="Search by name or side" value={query}
                    onChange={function (e) { setQuery(e.target.value); setPage(1); }} />

                <Table hover responsive head={[head('name', 'Service'), head('side', 'Graph'), head('kind', 'Kind'), 'Carries']}>
                    {shown.map(function (r, i) {
                        return (
                            <tr key={r.side + r.name + i}>
                                <td className="fw-semibold">{r.name}</td>
                                <td><Badge variant={r.side === 'server' ? 'success' : 'info'}>{r.side}</Badge></td>
                                <td className="text-body-secondary">{r.kind}</td>
                                <td className="small text-body-secondary">{r.keys}</td>
                            </tr>
                        );
                    })}
                    {shown.length === 0 ? (
                        <tr><td colSpan="4" className="text-center text-body-secondary">nothing matches</td></tr>
                    ) : null}
                </Table>

                <Pagination page={page} pages={pages} onSelect={setPage} size="sm" />
            </Section>

            <Section title="List groups">
                <div className="row g-4">
                    <div className="col-md-6">
                        <ListGroup>
                            <ListItem active>Active</ListItem>
                            <ListItem>Plain</ListItem>
                            <ListItem disabled>Disabled</ListItem>
                            <ListItem variant="success">Success</ListItem>
                            <ListItem variant="danger">Danger</ListItem>
                        </ListGroup>
                    </div>
                    <div className="col-md-6">
                        <ListGroup numbered>
                            {filtered.slice(0, 5).map(function (r, i) {
                                return (
                                    <ListItem key={i} className="d-flex justify-content-between align-items-start">
                                        <span className="ms-2 me-auto fw-semibold">{r.name}</span>
                                        <Badge pill variant="secondary">{r.side}</Badge>
                                    </ListItem>
                                );
                            })}
                        </ListGroup>
                    </div>
                </div>
            </Section>

            <Section title="Tables">
                <div className="row g-4">
                    <div className="col-md-6">
                        <Card title="Striped and small">
                            <Table striped small head={['#', 'Runtime', 'Runs']}>
                                <tr><td>1</td><td>main.js</td><td>nw&apos;s node context</td></tr>
                                <tr><td>2</td><td>server.js</td><td>the node half, reloaded</td></tr>
                                <tr><td>3</td><td>window.js</td><td>the browser</td></tr>
                                <tr><td>4</td><td>cli.js</td><td>a terminal</td></tr>
                            </Table>
                        </Card>
                    </div>
                    <div className="col-md-6">
                        <Card title="Bordered">
                            <Table bordered head={['Store', 'Backed by']}>
                                <tr><td>config</td><td>localStorage</td></tr>
                                <tr><td>session</td><td>sessionStorage</td></tr>
                            </Table>
                        </Card>
                        <Alert variant="secondary" className="mt-3" icon="info-circle">
                            Sort by clicking a column, and the search covers both.
                        </Alert>
                    </div>
                </div>
            </Section>
        </>
    );
};
