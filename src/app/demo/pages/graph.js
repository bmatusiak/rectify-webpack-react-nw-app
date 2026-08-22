var React = require('react');
var { useState, useEffect, useMemo } = React;

//THIS APP'S OWN DEPENDENCY GRAPH, DRAWN.
//
//rectify keeps the resolved graph on the `app` service as `app.plugins` --
//frozen { name, provides, consumes } records, in load order -- because only the
//container can know it. The Data page already lists the same services, sorted
//and paginated, and a list is a perfectly good way to answer "is `settings`
//there". It is a bad way to answer "what happens if I delete io", and that is
//the question this page is for.
//
//TWO GRAPHS, NOT ONE, and that is the point rather than a detail. The window and
//the node half are separate rectify apps that share service NAMES: `io`, `ipc`,
//`window` and `tray` all appear on both sides with a different plugin behind
//them. Flipping between the two pictures shows that immediately.

//SERVICES NOTHING IN THE LIST PROVIDES CAME FROM THE CONTAINER. `app` is
//rectify's own, and `Plugin` is pushed in by the boot. Drawing them as nodes is
//more honest than dropping the edges: `app` is the most-consumed thing in
//either graph, and a picture that hid it would be a picture of a different app.
//THE PAGE'S OWN NODE COLOURS NEED BOTH MODES TOO.
//
//../../ui/litegraph paints the canvas and the ordinary nodes from the palette it
//is handed, but these two kinds are the PAGE's idea and the page has to say what
//they look like. Left dark-only they stayed dark on a light canvas -- and worse,
//the title colour comes from the palette, so a dark node in light mode had dark
//text on it and could not be read at all.
var CONTAINER = {
    dark: { colour: '#3d2f14', background: '#241d10' },
    light: { colour: '#f0e2c0', background: '#fbf3e0' }
};

var TEST_COLOURS = {
    dark: { colour: '#14303d', background: '#101f24' },
    light: { colour: '#cfe4ee', background: '#eaf4f9' }
};

//test plugins are plugins, and drawing them is part of the point -- but they
//provide nothing and consume `selftest`, so they hang off the right-hand edge
//in a column of their own. A different colour says which is which without a
//legend.

//WHAT TO CALL A NODE, WHICH IS NOT ITS name.
//
//rectify names a plugin after its setup function, and every setup function in
//this app is called `plugin` — so a plugin that provides something is called
//"the plugin providing [io]", which is accurate and too long to draw. What
//identifies it on a graph is what it provides.
//
//A plugin providing NOTHING has only its name, and rectify has two fallbacks for
//an anonymous one — "the plugin providing [...]" and "the plugin at config index
//N consuming [...]". Both are accurate and neither fits in a box: the second is
//eleven service names long for the demo's own window half.
//
//src/target.js gives the test plugins their folder path, which is why those read
//properly. The rest genuinely have no name to show, so the node says what it is
//for and the panel below shows what rectify calls it.
var ANONYMOUS = ['the plugin providing', 'the plugin at config index'];

function label(entry) {
    if (entry.provides.length) return entry.provides.join(' + ');

    var name = String(entry.name || '');
    var anonymous = name === '' || name === 'plugin' || ANONYMOUS.some(function (start) {
        return name.indexOf(start) === 0;
    });

    if (anonymous) return 'adds to others';
    return name.replace(/\.test\.js$/, '').replace(/\.js$/, '');
}

function build(plugins, mode) {
    var container = CONTAINER[mode === 'light' ? 'light' : 'dark'];
    var test = TEST_COLOURS[mode === 'light' ? 'light' : 'dark'];

    var provider = {};
    plugins.forEach(function (p) {
        p.provides.forEach(function (name) { provider[name] = p.name; });
    });

    //every service consumed that no plugin here provides
    var outside = {};
    plugins.forEach(function (p) {
        p.consumes.forEach(function (name) {
            if (!provider[name]) outside[name] = true;
        });
    });

    var nodes = [];
    var byName = {};

    Object.keys(outside).sort().forEach(function (name) {
        byName[name] = { id: name, title: name, inputs: [], outputs: [name], container: true };
        nodes.push(byName[name]);
    });

    plugins.forEach(function (p) {
        byName[p.name] = {
            id: p.name,
            title: label(p),
            inputs: p.consumes.concat(),
            outputs: p.provides.concat(),
            test: /\.test\.js$/.test(String(p.name))
        };
        nodes.push(byName[p.name]);
    });

    //DEPTH IS THE LONGEST PATH IN, which is what puts a plugin to the right of
    //everything it needs. rectify sorts the load the same way, so this is the
    //load order made visible rather than a second opinion about it.
    //
    //MEMOISED AND GUARDED. rectify cannot resolve a cycle, so one cannot reach
    //this -- but a guard costs a line and a stack overflow inside a render costs
    //a blank window.
    var depth = {};
    function depthOf(name, seen) {
        if (depth[name] != null) return depth[name];
        if (seen[name]) return 0;
        seen[name] = true;

        var node = byName[name];
        var d = 0;
        if (node && !node.container) {
            node.inputs.forEach(function (service) {
                var from = provider[service] || (outside[service] ? service : null);
                if (from && from !== name) d = Math.max(d, depthOf(from, seen) + 1);
            });
        }
        delete seen[name];
        depth[name] = d;
        return d;
    }
    nodes.forEach(function (n) { depthOf(n.id, {}); });

    //laid out in columns, one per depth
    var columns = {};
    nodes.forEach(function (n) {
        var d = depth[n.id] || 0;
        (columns[d] = columns[d] || []).push(n);
    });

    Object.keys(columns).forEach(function (d) {
        columns[d].forEach(function (n, i) {
            n.pos = [40 + Number(d) * 300, 40 + i * 110];
            if (n.container) { n.colour = container.colour; n.background = container.background; }
            if (n.test) { n.colour = test.colour; n.background = test.background; }
        });
    });

    var links = [];
    plugins.forEach(function (p) {
        p.consumes.forEach(function (service, i) {
            var from = provider[service] || (outside[service] ? service : null);
            if (!from) return;
            var source = byName[from];
            var out = source.outputs.indexOf(service);
            links.push({ from: from, out: out < 0 ? 0 : out, to: p.name, in: i });
        });
    });

    return { nodes: nodes, links: links, depth: depth, provider: provider };
}

module.exports = function GraphPage(props) {
    var { theme, io, litegraph, services, ext } = props;
    var { Section, Panel, Columns, Button, ButtonGroup, Badge, Alert, Icon, ListGroup, ListItem } = theme.ui;
    var Graph = litegraph.Graph;

    //THE PAGE PICKS THE PALETTE, NOT THE PLUGIN -- see the Terminal page for the
    //full reasoning. `theme.showing` and not `theme.mode`: a dark-only swatch
    //asked for light stays dark, and a white surface in it would be a hole cut
    //in the window.
    var [mode, setMode] = useState(theme.showing);
    useEffect(function () { return theme.onModeChange(function () { setMode(theme.showing); }); }, []);

    var look = litegraph.look(mode);

    var [side, setSide] = useState('window');
    var [server, setServer] = useState(null);
    var [picked, setPicked] = useState(null);

    //THE WINDOW'S GRAPH IS ALREADY HERE. It is the app this code is running in,
    //so it needs no round trip -- src/app/demo/window.js passes it down.
    var here = props.plugins || [];

    useEffect(function () {
        io.emit('demo:graph', {}, function (list) { setServer(list || []); });
    }, []);

    var plugins = side === 'window' ? here : (server || []);
    var graph = useMemo(function () { return build(plugins, mode); }, [plugins, mode]);

    //A NEW ARRAY EVERY RENDER WOULD REBUILD THE CANVAS EVERY RENDER, and
    //rebuilding it loses wherever you had panned to. So the description is
    //memoised on the thing it actually depends on.
    var nodes = graph.nodes;
    var links = graph.links;

    var chosen = picked ? plugins.filter(function (p) { return p.name === picked; })[0] : null;
    var containerService = picked && !chosen && graph.provider[picked] === undefined;

    //WHO WOULD BREAK, ASKED OF THE CONTAINER RATHER THAN WORKED OUT AGAIN.
    //
    //`ext` is rectify's registry, provided by the same plugin that provides
    //`Plugin`. Its `dependents(name)` reads the GRAPH rather than the registry,
    //so it answers for plugins that never touched PluginBase -- which is most of
    //them here. Re-deriving it from `provides`/`consumes` would be a second
    //implementation of something the container already knows, and the two would
    //drift the first time rectify changed what a dependent means.
    //
    //THE NODE HALF IS A DIFFERENT CONTAINER, and this one cannot ask it. Its
    //`ext` lives in that process, so the same question is answered from the
    //records it sent -- said out loud rather than hidden, because a page that
    //quietly answers two different ways is worse than one that says which.
    function dependentsOf(entry) {
        if (!entry) return { names: [], from: null };

        if (side === 'window' && ext && ext.dependents) {
            return {
                names: ext.dependents(entry.name).map(function (e) { return e.name; }),
                from: 'ext.dependents()'
            };
        }

        return {
            names: plugins.filter(function (p) {
                return p.consumes.some(function (s) { return entry.provides.indexOf(s) >= 0; });
            }).map(function (p) { return p.name; }),
            from: 'the records the node half sent'
        };
    }

    var dependents = dependentsOf(chosen);

    return (
        <>
            <Section title="Graph" lead="this app's own dependency graph, the way rectify resolved it"
                aside={
                    <ButtonGroup>
                        <Button variant={side === 'window' ? 'primary' : 'outline-secondary'} size="sm"
                            onClick={function () { setSide('window'); setPicked(null); }}>
                            <Icon name="window" /> window
                        </Button>
                        <Button variant={side === 'server' ? 'primary' : 'outline-secondary'} size="sm"
                            onClick={function () { setSide('server'); setPicked(null); }}>
                            <Icon name="hdd-network" /> node half
                        </Button>
                    </ButtonGroup>
                }>

                <Alert variant="secondary" className="small">
                    <Icon name="diagram-3" /> {plugins.length} plugins, {links.length} edges.
                    Left to right is load order: nothing is drawn until everything feeding it
                    has been. Orange is a service the container provides rather than a plugin;
                    blue is a test, which is a plugin like any other. Drag a node to move it,
                    drag the background to pan, scroll to zoom. Nothing here can be edited
                    &mdash; it is a picture of something that is already resolved.
                </Alert>

                {side === 'server' && server === null
                    ? <Alert variant="warning"><Icon name="hourglass" /> asking the node half&hellip;</Alert>
                    //FITTED, because this graph grows every time a plugin is
                    //added. At a fixed 520 the bottom row was simply cut off,
                    //with nothing on screen to say there was more below.
                    : <Graph nodes={nodes} links={links} height={420} fit
                        look={look} onSelect={setPicked} />}
            </Section>

            <Section title="What was clicked" lead="the same record, in words">
                <Columns of={2}>
                    <Panel title={chosen ? label(chosen) : (picked || 'nothing selected')}
                        lead={chosen ? 'a plugin in this graph' : containerService
                            ? 'a service the container provides, not a plugin'
                            : 'click a node above'}>
                        {chosen ? (
                            <>
                                <div className="mb-3">
                                    <div className="small text-body-secondary mb-1">rectify calls it</div>
                                    <code className="small">{chosen.name}</code>
                                </div>
                                <div className="mb-3">
                                    <div className="small text-body-secondary mb-1">provides</div>
                                    {chosen.provides.length
                                        ? chosen.provides.map(function (s) {
                                            return <Badge key={s} variant="success" className="me-1">{s}</Badge>;
                                        })
                                        : <span className="text-body-secondary small">nothing &mdash; it exists to add to others</span>}
                                </div>
                                <div>
                                    <div className="small text-body-secondary mb-1">consumes</div>
                                    {chosen.consumes.length
                                        ? chosen.consumes.map(function (s) {
                                            return <Badge key={s} variant="info" className="me-1">{s}</Badge>;
                                        })
                                        : <span className="text-body-secondary small">nothing &mdash; it loads first</span>}
                                </div>
                            </>
                        ) : (
                            <p className="text-body-secondary small mb-0">
                                The orange nodes are services the container provides rather than
                                plugins: <code>app</code> is rectify&rsquo;s own, and <code>Plugin</code>
                                {' '}is pushed into the list by the boot.
                            </p>
                        )}
                    </Panel>

                    <Panel title="Who would break"
                        lead={chosen ? 'according to ' + dependents.from : 'select a node'}>
                        {chosen
                            ? (dependents.names.length
                                ? <ListGroup>
                                    {dependents.names.map(function (name) {
                                        return <ListItem key={name} onClick={function () { setPicked(name); }}>
                                            <Icon name="arrow-return-right" /> {label({ name: name, provides: [], consumes: [] })}
                                            <span className="text-body-secondary small ms-2">{name}</span>
                                        </ListItem>;
                                    })}
                                </ListGroup>
                                : <p className="text-body-secondary small mb-0">
                                    Nothing consumes it. Delete the folder and this graph loses one node
                                    and no edges.
                                </p>)
                            : <p className="text-body-secondary small mb-0">
                                This is the question a list cannot answer without being read twice, and
                                the one <code>ext.dependents()</code> exists for.
                            </p>}
                    </Panel>
                </Columns>
            </Section>

            <Section title="The same thing, resolved"
                lead="what the container handed this window, for comparison">
                <p className="text-body-secondary small">
                    {Object.keys(services || {}).length} services are resolved in this window right
                    now. The graph above is how they got there.
                </p>
            </Section>
        </>
    );
};
