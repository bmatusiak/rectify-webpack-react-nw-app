var React = require('react');
var { useState } = React;

var VARIANTS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];

//the six that carry their own contrast either way round
var COLOURS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info'];

module.exports = function Buttons(props) {
    var { theme, toast } = props;
    var { Section, Button, ButtonGroup, Badge, Spinner, Placeholder, Progress, Alert, Icon, Card } = theme.ui;

    var [loading, setLoading] = useState(false);
    var [count, setCount] = useState(0);
    var [progress, setProgress] = useState(35);

    function work() {
        setLoading(true);
        setTimeout(function () { setLoading(false); toast('finished', 'success', 'check2'); }, 1200);
    }

    return (
        <>
            <Section title="Guarded" id="guarded"
                lead="a press that is a person's to make, beside the same control without a guard">

                <p className="text-body-secondary">
                    The lock and the ring are painted from <code>core/may</code>, and the press goes
                    through it &mdash; so a control cannot be drawn as guarded without being guarded,
                    or guarded without saying so. Try the pair below, then drive the same button from
                    the terminal and watch it refuse.
                </p>

                <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
                    <Button variant="primary" guard="markup"
                        onRefused={function (said) { toast(said.why, 'warning', 'shield-lock'); }}
                        onClick={function () { toast('allowed, and it would have run', 'success', 'unlock'); }}>
                        Write the page to a file
                    </Button>

                    <Button variant="primary"
                        onClick={function () { toast('no guard, so it just happened', 'secondary'); }}>
                        The same button, unguarded
                    </Button>
                </div>

                <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
                    <Button outline variant="danger" guard="serve"
                        onRefused={function (said) { toast(said.why, 'warning', 'shield-lock'); }}
                        onClick={function () { toast('allowed', 'success', 'unlock'); }}>
                        Serve to a browser
                    </Button>

                    <Button outline variant="danger"
                        onClick={function () { toast('no guard', 'secondary'); }}>
                        The same, unguarded
                    </Button>
                </div>

                <Alert variant="secondary" className="d-flex align-items-start gap-2 mb-0">
                    <Icon name="info-circle" className="mt-1" />
                    <span>
                        <strong>The mark is a shape, not a colour.</strong> Twenty-eight swatches ship
                        here and five already spend a purple &mdash; <code>vapor</code>&rsquo;s primary
                        is the exact one there would be to reserve. A dashed ring and a lock are true in
                        all of them, survive a swatch added later, and are legible in a greyscale
                        screenshot. <code>--bs-guarded</code> is still the colour&rsquo;s name.
                    </span>
                </Alert>
            </Section>

            <Section title="Buttons" lead="every variant, filled and outline"
                aside={<Badge pill variant="secondary">{count} clicks</Badge>}>
                <div className="d-flex flex-wrap gap-2 mb-3">
                    {VARIANTS.map(function (v) {
                        return <Button key={v} variant={v}
                            onClick={function () { setCount(count + 1); }}>{v}</Button>;
                    })}
                </div>
                <div className="d-flex flex-wrap gap-2">
                    {COLOURS.map(function (v) {
                        return <Button key={v} variant={v} outline
                            onClick={function () { setCount(count + 1); }}>{v}</Button>;
                    })}
                </div>

                {/*an outline button is its own colour and nothing else, so
                   outline-light on a light page is invisible and so is
                   outline-dark on a dark one. bootstrap's own examples put
                   each on the ground it was drawn for, and so does this.*/}
                <div className="d-flex flex-wrap gap-3 mt-3">
                    <div className="d-inline-flex gap-2 p-2 rounded bg-dark">
                        <Button variant="light" outline
                            onClick={function () { setCount(count + 1); }}>light</Button>
                    </div>
                    <div className="d-inline-flex gap-2 p-2 rounded bg-light">
                        <Button variant="dark" outline
                            onClick={function () { setCount(count + 1); }}>dark</Button>
                    </div>
                    <span className="align-self-center small text-body-secondary">
                        each on the ground it was drawn for
                    </span>
                </div>
            </Section>

            <Section title="Sizes and state">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <Button size="lg">Large</Button>
                    <Button>Default</Button>
                    <Button size="sm">Small</Button>
                    <Button disabled>Disabled</Button>
                    <Button active>Active</Button>
                    <Button icon="download" variant="success" onClick={work} disabled={loading}>
                        {loading ? 'Working' : 'With an icon'}
                    </Button>
                    {loading ? <Spinner size="sm" /> : null}
                </div>

                <ButtonGroup className="me-2">
                    <Button outline variant="secondary" onClick={function () { setProgress(Math.max(0, progress - 10)); }}>
                        <Icon name="dash-lg" />
                    </Button>
                    <Button outline variant="secondary" disabled className="btn-readout">{progress}%</Button>
                    <Button outline variant="secondary" onClick={function () { setProgress(Math.min(100, progress + 10)); }}>
                        <Icon name="plus-lg" />
                    </Button>
                </ButtonGroup>
            </Section>

            <Section title="Progress, spinners, placeholders" lead="the buttons above drive the bar">
                <div className="row g-4">
                    <div className="col-md-6">
                        <Progress value={progress} label className="mb-2" />
                        <Progress value={progress} variant="success" striped animated className="mb-2" />
                        <Progress value={100 - progress} variant="danger" />
                    </div>
                    <div className="col-md-3">
                        <Card title="Spinners">
                            <div className="d-flex gap-2 align-items-center">
                                <Spinner variant="primary" />
                                <Spinner grow variant="success" />
                                <Spinner size="sm" variant="danger" />
                            </div>
                        </Card>
                    </div>
                    <div className="col-md-3">
                        <Card title="Placeholder"><Placeholder lines={3} /></Card>
                    </div>
                </div>
            </Section>

            <Section title="Alerts">
                {['primary', 'success', 'warning', 'danger'].map(function (v) {
                    return (
                        <Alert key={v} variant={v} dismissible icon="info-circle">
                            <strong className="text-capitalize">{v}.</strong> Dismissible, and it stays dismissed.
                        </Alert>
                    );
                })}
            </Section>
        </>
    );
};
