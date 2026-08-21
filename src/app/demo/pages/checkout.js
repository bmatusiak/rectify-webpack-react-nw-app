var React = require('react');
var { useState } = React;

//bootstrap's checkout example. The form there validates because the browser
//does it; the cart there does not add up, because the total is a number
//somebody typed. This one adds up, remembers what you filled in, and the
//promo code is real -- there is exactly one and it is DEMO10.

var CATALOGUE = [
    { name: 'Product name', note: 'Brief description', price: 12 },
    { name: 'Second product', note: 'Brief description', price: 8 },
    { name: 'Third item', note: 'Brief description', price: 5 }
];

module.exports = function Checkout(props) {
    var { theme, settings, toast } = props;
    var { Section, Cart, ValidatedForm, Input, Select, Check, Button, Alert, Icon } = theme.ui;

    //the form survives a reload, because it is in the store
    var saved = settings('demo.checkout', {
        first: '', last: '', email: '', address: '', country: '', state: '', zip: '',
        //NOT `save`. The store's own writer is called that, and its loop skips
        //a default of that name rather than shadowing it -- so `form.save` was
        //the function, react was handed a function as `checked`, and the only
        //sign was a warning nobody was reading.
        same: false, remember: false
    });

    var [form, setForm] = useState(saved);
    var [promo, setPromo] = useState(null);
    var [placed, setPlaced] = useState(null);

    function set(key) {
        return function (e) {
            var value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            setForm(function (was) {
                var next = Object.assign({}, was, { [key]: value });
                saved[key] = value;//the store writes through
                return next;
            });
        };
    }

    function redeem(code) {
        if (code.toUpperCase() === 'DEMO10') {
            setPromo({ code: code.toUpperCase(), off: 10 });
            toast('promo applied, $10 off', 'success', 'tag');
        } else {
            setPromo(null);
            toast('no such code: ' + code, 'danger', 'x-circle');
        }
    }

    function place() {
        setPlaced({ at: new Date().toLocaleTimeString(), name: form.first + ' ' + form.last });
        toast('order placed', 'success', 'check2-circle');
    }

    return (
        <>
            <div className="py-4 text-center">
                <Icon name="bag-check" size="40" className="mb-3 text-primary" />
                <h1 className="h2 text-body-emphasis">Checkout form</h1>
                <p className="lead text-body-secondary mb-0">
                    Every required field has a validation state the browser decides. Submit it
                    empty and it will tell you so.
                </p>
            </div>

            {placed ? (
                <Alert variant="success" icon="check2-circle" className="mb-4">
                    Order placed at {placed.at}{placed.name.trim() ? ' for ' + placed.name : ''}. Nothing was sent anywhere.
                </Alert>
            ) : null}

            <div className="row g-5">
                <div className="col-md-5 col-lg-4 order-md-last">
                    <Cart items={CATALOGUE} promo={promo} onPromo={redeem} />
                </div>

                <div className="col-md-7 col-lg-8">
                    <Section title="Billing address">
                        <ValidatedForm onSubmit={place}>
                            <div className="row g-3">
                                <div className="col-sm-6">
                                    <Input id="c-first" label="First name" value={form.first}
                                        onChange={set('first')} required invalid="First name is required." />
                                </div>
                                <div className="col-sm-6">
                                    <Input id="c-last" label="Last name" value={form.last}
                                        onChange={set('last')} required invalid="Last name is required." />
                                </div>
                                <div className="col-12">
                                    <Input id="c-email" type="email" label="Email" placeholder="you@example.com"
                                        value={form.email} onChange={set('email')} required
                                        invalid="A valid email is required." />
                                </div>
                                <div className="col-12">
                                    <Input id="c-address" label="Address" placeholder="1234 Main St"
                                        value={form.address} onChange={set('address')} required
                                        invalid="An address is required." />
                                </div>
                                <div className="col-md-5">
                                    <Select id="c-country" label="Country" value={form.country}
                                        onChange={set('country')} required invalid="Pick a country."
                                        options={['', 'United States', 'United Kingdom', 'Germany']} />
                                </div>
                                <div className="col-md-4">
                                    <Select id="c-state" label="State" value={form.state}
                                        onChange={set('state')} required invalid="Pick a state."
                                        options={['', 'California', 'Oregon', 'Washington']} />
                                </div>
                                <div className="col-md-3">
                                    <Input id="c-zip" label="Zip" value={form.zip}
                                        onChange={set('zip')} required invalid="Zip is required." />
                                </div>
                            </div>

                            <hr className="my-4" />

                            <Check id="c-same" label="Shipping address is the same as billing"
                                checked={form.same} onChange={set('same')} />
                            <Check id="c-save" label="Save this information for next time"
                                checked={form.remember} onChange={set('remember')} />

                            <hr className="my-4" />

                            <Button type="submit" size="lg" className="w-100" icon="lock">
                                Continue to checkout
                            </Button>
                        </ValidatedForm>
                    </Section>
                </div>
            </div>
        </>
    );
};
