var React = require('react');
var { useState } = React;

module.exports = function Disclosure(props) {
    var { theme, toast } = props;
    var { Section, Accordion, Collapse, Carousel, Tabs, Card, Badge, Icon, Button } = theme.ui;

    var [tab, setTab] = useState('main');

    var runtimes = {
        main: {
            title: 'main.js',
            text: 'Runs in nw\u2019s node context, off disk, never bundled. It owns the server, the window, the tray and the control socket \u2014 everything that has to outlive a reload.'
        },
        server: {
            title: 'server.js',
            text: 'The app\u2019s node half. Bundled by webpack and reloaded on every save, which is why anything it registers has to come back off in onDestroy.'
        },
        window: {
            title: 'window.js',
            text: 'The browser. No node in it at all \u2014 it reaches the other side over socket.io, and nothing else.'
        },
        cli: {
            title: 'cli.js',
            text: 'A terminal. Plain node, no window, talking to a running app over a named pipe or a unix socket.'
        }
    };

    return (
        <>
            <Section title="Tabs" lead="the four runtimes, one at a time">
                <Tabs items={Object.keys(runtimes).map(function (id) {
                    return { id: id, label: runtimes[id].title };
                })} active={tab} onSelect={setTab} />
                <Card className="border-top-0 rounded-top-0">
                    <h5>{runtimes[tab].title}</h5>
                    <p className="mb-0 text-body-secondary">{runtimes[tab].text}</p>
                </Card>

                <Tabs pills className="mt-4" items={Object.keys(runtimes).map(function (id) {
                    return { id: id, label: runtimes[id].title };
                })} active={tab} onSelect={setTab} />
            </Section>

            <Section title="Accordion" lead="one open at a time on the left, several on the right">
                <div className="row g-4">
                    <div className="col-md-6">
                        <Accordion items={[
                            { title: 'What a plugin is', body: 'A folder in src/app. The files in it say where it runs.', open: true },
                            { title: 'How they find each other', body: 'consumes and provides. Rectify sorts the order out.' },
                            { title: 'How they are registered', body: 'They are not. The folder is the registry.' }
                        ]} />
                    </div>
                    <div className="col-md-6">
                        <Accordion alwaysOpen flush items={[
                            { title: 'Flush, and always open', body: 'No parent, so opening one leaves the others alone.' },
                            { title: 'Second', body: 'Open this and the first stays where it was.' },
                            { title: 'Third', body: 'And so does this.' }
                        ]} />
                    </div>
                </div>
            </Section>

            <Section title="Collapse">
                <div className="d-flex flex-wrap gap-4">
                    <Collapse label="Show the details" variant="secondary">
                        Collapse rides on bootstrap&apos;s data attributes, so there is no instance to
                        create and nothing to dispose.
                    </Collapse>
                    <Collapse label="And another" variant="primary" open>
                        This one starts open. They do not interfere with each other, because each gets
                        its own id.
                    </Collapse>
                </div>
            </Section>

            <Section title="Carousel" lead="an instance, disposed when the page changes"
                aside={<Badge variant="secondary" pill>auto, every 4s</Badge>}>
                <Carousel slides={[
                    {
                        caption: 'One folder', text: 'core, main and app became src/app',
                        body: <Icon name="folder2-open" size="64" className="text-primary" />,
                        className: 'bg-body-tertiary'
                    },
                    {
                        caption: 'Three boots', text: 'main, server, window \u2014 and the cli',
                        body: <Icon name="diagram-3" size="64" className="text-success" />,
                        className: 'bg-body-tertiary'
                    },
                    {
                        caption: 'No javascript shipped', text: 'nwjc compiles main.bin',
                        body: <Icon name="shield-lock" size="64" className="text-danger" />,
                        className: 'bg-body-tertiary'
                    }
                ]} />

                <div className="mt-3">
                    <Button size="sm" outline variant="secondary"
                        onClick={function () { toast('the slides keep moving on their own', 'secondary'); }}>
                        It runs itself
                    </Button>
                </div>
            </Section>
        </>
    );
};
