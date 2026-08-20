var React = require('react');
var { useState } = React;

//bootstrap's cover example is a whole-window page: a masthead, a line, a
//button, a footer, and nothing else. This app already owns the window, so it
//is rendered into a box -- and the three masthead links actually go somewhere,
//which in the original they do not.

var PANELS = {
    cover: {
        title: 'Cover',
        lead: 'A single screen with one thing to say and one thing to do. The original is the whole window; this is the same page in a frame.'
    },
    about: {
        title: 'About',
        lead: 'Every block on this page is a component in src/app/theme. Delete the demo folder and the scaffold is still an app.'
    },
    contact: {
        title: 'Contact',
        lead: 'There is nobody to contact. The button below proves the click arrived by way of a toast.'
    }
};

module.exports = function CoverPage(props) {
    var { theme, appPackage, toast } = props;
    var { Section, Cover, Button, Panel, Columns, Icon } = theme.ui;

    var [panel, setPanel] = useState('cover');
    var shown = PANELS[panel];

    return (
        <>
            <Section title="Cover" lead="the whole-window example, in a box">
                <Cover
                    brand={appPackage.title}
                    nav={[
                        { id: 'cover', label: 'Home' },
                        { id: 'about', label: 'About' },
                        { id: 'contact', label: 'Contact' }
                    ]}
                    active={panel}
                    onSelect={setPanel}
                    title={shown.title}
                    lead={shown.lead}
                    action={
                        <Button size="lg" variant="light" className="fw-bold border-white bg-white"
                            onClick={function () { toast('the cover button, from the ' + panel + ' panel', 'primary', 'stars'); }}>
                            Learn more
                        </Button>
                    }
                    footer={<span>{appPackage.name} {appPackage.version}</span>} />
            </Section>

            <Section title="What it is made of" lead="three utilities and no css of its own">
              <Columns of={3}>
                <Panel title="text-bg-dark">
                    <p className="mb-0 text-body-secondary small">
                        Background and foreground in one class, so the contrast is bootstrap&apos;s
                        problem rather than yours.
                    </p>
                </Panel>
                <Panel title="mb-auto / mt-auto">
                    <p className="mb-0 text-body-secondary small">
                        The masthead pushes down and the footer pushes up. Nothing is positioned,
                        and the middle takes whatever is left.
                    </p>
                </Panel>
                <Panel title="d-flex flex-column">
                    <p className="mb-0 text-body-secondary small">
                        Three children in a column. That is the entire layout of the original
                        example, minus a stylesheet setting the height.
                    </p>
                </Panel>
              </Columns>
            </Section>
        </>
    );
};
