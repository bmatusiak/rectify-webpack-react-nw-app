var React = require('react');
var { useState } = React;

//this page writes to the `config` store, which is localStorage behind a typed
//accessor. reload the window and the values are still here.

module.exports = function Forms(props) {
    var { theme, preferences, toast } = props;
    var { Section, Form, Input, Textarea, Select, Check, Range, InputGroup, Button, Card, Alert, Badge } = theme.ui;

    var saved = preferences('demo.profile', {
        name: '', email: '', role: 'developer', about: '', notify: true, level: 50
    });

    var [state, setState] = useState({
        name: saved.name, email: saved.email, role: saved.role,
        about: saved.about, notify: saved.notify, level: saved.level
    });
    var [savedAt, setSavedAt] = useState(null);

    function set(key) {
        return function (e) {
            var value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            var next = Object.assign({}, state);
            next[key] = value;
            setState(next);
        };
    }

    function save() {
        Object.keys(state).forEach(function (k) { saved[k] = state[k]; });
        setSavedAt(new Date().toLocaleTimeString());
        toast('saved to the preferences store', 'success', 'save');
    }

    return (
        <>
            <Section title="Forms" lead="validated by the browser, stored by the app"
                aside={savedAt ? <Badge variant="success" pill>saved {savedAt}</Badge> : null}>
                <div className="row g-4">
                    <div className="col-lg-7">
                        <Card>
                            <Form onValidSubmit={save}>
                                <Input id="f-name" label="Name" required value={state.name} onChange={set('name')}
                                    hint="required, so submitting it empty shows the browser's own message" />
                                <Input id="f-email" label="Email" type="email" required
                                    value={state.email} onChange={set('email')} />
                                <Select id="f-role" label="Role" value={state.role} onChange={set('role')}
                                    options={['developer', 'designer', 'operator', 'other']} />
                                <Textarea id="f-about" label="About" rows="3" value={state.about} onChange={set('about')} />
                                <Range id="f-level" label={'Level: ' + state.level} min="0" max="100"
                                    value={state.level} onChange={set('level')} />
                                <Check id="f-notify" type="switch" label="Send notifications"
                                    checked={!!state.notify} onChange={set('notify')} />
                                <div className="mt-3 d-flex gap-2">
                                    <Button type="submit" icon="save">Save</Button>
                                    <Button type="button" variant="secondary" outline onClick={function () {
                                        setState({ name: '', email: '', role: 'developer', about: '', notify: true, level: 50 });
                                    }}>Reset</Button>
                                </div>
                            </Form>
                        </Card>
                    </div>

                    <div className="col-lg-5">
                        <Card title="What is stored" subtitle="preferences, so it survives a restart">
                            <pre className="small mb-0">{JSON.stringify({
                                name: saved.name, email: saved.email, role: saved.role,
                                about: saved.about, notify: saved.notify, level: saved.level
                            }, null, 2)}</pre>
                        </Card>

                        <Alert variant="secondary" className="mt-3" icon="info-circle">
                            <code>preferences</code> is localStorage and <code>session</code> is sessionStorage,
                            both behind the same accessor. Which page you are on is in the second one.
                        </Alert>
                    </div>
                </div>
            </Section>

            <Section title="Input groups, floating labels, sizes">
                <div className="row g-3">
                    <div className="col-md-6">
                        <InputGroup before="@" className="mb-3">
                            <input className="form-control" placeholder="username" />
                        </InputGroup>
                        <InputGroup after=".00" before="$">
                            <input className="form-control" placeholder="amount" />
                        </InputGroup>
                    </div>
                    <div className="col-md-6">
                        <Input id="f-float" label="Floating label" floating />
                        <Input id="f-lg" placeholder="Large" size="lg" className="mb-2" />
                        <Input id="f-sm" placeholder="Small" size="sm" />
                    </div>
                </div>
            </Section>

            <Section title="Checks and radios">
                <div className="d-flex flex-wrap gap-4">
                    <div>
                        <Check id="c1" label="Checkbox" defaultChecked />
                        <Check id="c2" label="Disabled" disabled />
                        <Check id="c3" type="switch" label="Switch" defaultChecked />
                    </div>
                    <div>
                        <Check id="r1" type="radio" name="demo-radio" label="One" defaultChecked />
                        <Check id="r2" type="radio" name="demo-radio" label="Two" />
                        <Check id="r3" type="radio" name="demo-radio" label="Three" />
                    </div>
                    <div>
                        <Check id="i1" inline label="Inline" defaultChecked />
                        <Check id="i2" inline label="Inline" />
                    </div>
                </div>
            </Section>
        </>
    );
};
