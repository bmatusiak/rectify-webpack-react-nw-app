var React = require('react');
var { useState } = React;

var VARIANTS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];

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
            <Section title="Buttons" lead="every variant, filled and outline"
                aside={<Badge pill variant="secondary">{count} clicks</Badge>}>
                <div className="d-flex flex-wrap gap-2 mb-3">
                    {VARIANTS.map(function (v) {
                        return <Button key={v} variant={v}
                            onClick={function () { setCount(count + 1); }}>{v}</Button>;
                    })}
                </div>
                <div className="d-flex flex-wrap gap-2">
                    {VARIANTS.map(function (v) {
                        return <Button key={v} variant={v} outline
                            onClick={function () { setCount(count + 1); }}>{v}</Button>;
                    })}
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
                    <Button outline variant="secondary" disabled>{progress}%</Button>
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
