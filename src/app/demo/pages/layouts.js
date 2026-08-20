var React = require('react');
var { useState } = React;

//the page-shaped bootstrap examples — hero, features, pricing, album — with
//their choices wired to the store, so the page remembers what you picked.

module.exports = function Layouts(props) {
    var { theme, config, toast, open } = props;
    var { Section, Hero, Features, Pricing, Album, Stats, Card, Button, Modal, Badge, Icon } = theme.ui;

    var picked = config('demo.plan', { name: '' });
    var [plan, setPlan] = useState(picked.name);
    var [item, setItem] = useState(null);

    function choose(p) {
        setPlan(p.name);
        picked.name = p.name;
        toast('picked ' + p.name + ', and it is remembered', 'success', 'check2');
    }

    return (
        <>
            <Hero icon="rocket-takeoff" title="Built out of the same kit"
                lead="Every block on this page is a component in src/app/theme, and every one of them is what bootstrap's own examples do — heroes, features, pricing, album, dashboard tiles."
                actions={
                    <div className="d-flex gap-2">
                        <Button size="lg" icon="cpu" onClick={function () { open('system'); }}>See it live</Button>
                        <Button size="lg" outline variant="secondary"
                            onClick={function () { open('overlays'); }}>Open something</Button>
                    </div>
                } />

            <Section title="Features" lead="the features example">
                <Features items={[
                    { icon: 'folder2-open', title: 'One folder', text: 'A plugin is a folder, and the files in it say where it runs.' },
                    { icon: 'diagram-3', title: 'Four runtimes', text: 'main, server, window and cli, each gathering its own half.' },
                    { icon: 'arrow-repeat', title: 'Both halves reload', text: 'The window hot reloads; the node half is torn down and rebuilt.' },
                    { icon: 'plug', title: 'One socket each', text: 'socket.io to the window, a named pipe to the terminal.' },
                    { icon: 'shield-lock', title: 'Nothing shipped in the clear', text: 'nwjc compiles the node half into main.bin.' },
                    { icon: 'palette', title: 'Bring your own style', text: 'This kit is an example. Replace the folder.' }
                ]} />
            </Section>

            <Section title="Stats" lead="the dashboard example's tiles">
                <Stats items={[
                    { label: 'plugins', value: '11', icon: 'boxes', hint: 'in src/app' },
                    { label: 'runtimes', value: '4', icon: 'diagram-3', hint: 'main, server, window, cli' },
                    { label: 'components', value: '30+', icon: 'palette', hint: 'in theme.ui' },
                    { label: 'shipped .js', value: '0', icon: 'shield-lock', hint: 'in a package' }
                ]} />
            </Section>

            <Section title="Pricing" lead="the pricing example, and it remembers"
                aside={plan ? <Badge variant="success" pill>on {plan}</Badge> : null}>
                <Pricing onChoose={choose} plans={[
                    {
                        name: 'Free', price: '$0', features: ['One window', 'A tray icon', 'Community support'],
                        action: plan === 'Free' ? 'Current' : 'Choose'
                    },
                    {
                        name: 'Pro', price: '$15', featured: true,
                        features: ['Everything in Free', 'The control socket', 'Packaged builds'],
                        action: plan === 'Pro' ? 'Current' : 'Choose'
                    },
                    {
                        name: 'Team', price: '$29', features: ['Everything in Pro', 'CI on three platforms', 'Signed, one day'],
                        action: plan === 'Team' ? 'Current' : 'Choose'
                    }
                ]} />
            </Section>

            <Section title="Album" lead="the album example, and each opens">
                <Album onOpen={setItem} items={[
                    { title: 'lifecycle', text: 'Shutdown, the crash handlers, the instance file.', meta: 'main' },
                    { title: 'http', text: 'Express and the router that gets swapped on reload.', meta: 'main' },
                    { title: 'io', text: 'socket.io, on all three sides, sharing one serve().', meta: 'main server window' },
                    { title: 'ipc', text: 'A named pipe, and the commands the cli reaches.', meta: 'main server cli' },
                    { title: 'window', text: 'The nw window, and a controller for the other half.', meta: 'main server' },
                    { title: 'tray', text: 'The icon, the menu, and the api plugins add to.', meta: 'main server' }
                ]} />
            </Section>

            <Modal open={!!item} onClose={function () { setItem(null); }} title={item ? item.title : ''}
                footer={<Button onClick={function () { setItem(null); }}>Close</Button>}>
                {item ? (
                    <>
                        <p>{item.text}</p>
                        <p className="mb-0 text-body-secondary small">
                            <Icon name="folder" className="me-1" />
                            src/app/{item.title} — runs in {item.meta}
                        </p>
                    </>
                ) : null}
            </Modal>
        </>
    );
};
