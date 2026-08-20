var React = require('react');
var { cx } = require('./ui');

//form controls. each is controlled if you pass value and onChange, and
//uncontrolled if you do not, which is react's rule rather than a house one.

function Field(props) {
    var { label, hint, error, invalid, htmlFor, className, children } = props;
    return (
        <div className={cx('mb-3', className)}>
            {label ? <label className="form-label" htmlFor={htmlFor}>{label}</label> : null}
            {children}

            {/*two kinds of wrong. `error` is one you decided and want shown
               now, so it carries d-block. `invalid` is one the browser decides
               -- it stays hidden until the form is marked was-validated and
               the control itself is :invalid, which is bootstrap's own
               mechanism and the reason the checkout example works at all.*/}
            {error ? <div className="invalid-feedback d-block">{error}</div> : null}
            {invalid && !error ? <div className="invalid-feedback">{invalid}</div> : null}
            {hint && !error ? <div className="form-text">{hint}</div> : null}
        </div>
    );
}

function Input(props) {
    var { label, hint, error, invalid, size, floating, className, id, ...rest } = props;
    var control = (
        <input id={id} className={cx('form-control', size && 'form-control-' + size, error && 'is-invalid', className)}
            placeholder={floating ? (rest.placeholder || label || ' ') : rest.placeholder} {...rest} />
    );

    if (floating) return (
        <div className="form-floating mb-3">
            {control}
            <label htmlFor={id}>{label}</label>
        </div>
    );

    return <Field label={label} hint={hint} error={error} invalid={invalid} htmlFor={id}>{control}</Field>;
}

function Textarea(props) {
    var { label, hint, error, invalid, className, id, ...rest } = props;
    return (
        <Field label={label} hint={hint} error={error} invalid={invalid} htmlFor={id}>
            <textarea id={id} className={cx('form-control', error && 'is-invalid', className)} {...rest} />
        </Field>
    );
}

function Select(props) {
    var { label, hint, error, invalid, options, size, className, id, children, ...rest } = props;
    return (
        <Field label={label} hint={hint} error={error} invalid={invalid} htmlFor={id}>
            <select id={id} className={cx('form-select', size && 'form-select-' + size, error && 'is-invalid', className)} {...rest}>
                {options ? options.map(function (o, i) {
                    var value = typeof o === 'string' ? o : o.value;
                    var text = typeof o === 'string' ? o : o.label;
                    return <option key={i} value={value}>{text}</option>;
                }) : children}
            </select>
        </Field>
    );
}

function Check(props) {
    var { label, type, id, inline, className, ...rest } = props;
    return (
        <div className={cx('form-check', type === 'switch' && 'form-switch', inline && 'form-check-inline', className)}>
            <input className="form-check-input" type={type === 'radio' ? 'radio' : 'checkbox'}
                role={type === 'switch' ? 'switch' : undefined} id={id} {...rest} />
            {label ? <label className="form-check-label" htmlFor={id}>{label}</label> : null}
        </div>
    );
}

function Range(props) {
    var { label, id, className, ...rest } = props;
    return (
        <Field label={label} htmlFor={id}>
            <input type="range" className={cx('form-range', className)} id={id} {...rest} />
        </Field>
    );
}

function InputGroup(props) {
    var { before, after, size, className, children } = props;
    return (
        <div className={cx('input-group', size && 'input-group-' + size, className)}>
            {before ? <span className="input-group-text">{before}</span> : null}
            {children}
            {after ? <span className="input-group-text">{after}</span> : null}
        </div>
    );
}

//novalidate plus bootstrap's was-validated is what turns the browser's own
//constraint checking into the styled version, rather than a second one
function Form(props) {
    var { onValidSubmit, className, children, ...rest } = props;
    var [validated, setValidated] = React.useState(false);

    return (
        <form noValidate className={cx(validated && 'was-validated', className)}
            onSubmit={function (e) {
                e.preventDefault();
                setValidated(true);
                if (e.currentTarget.checkValidity() && onValidSubmit) onValidSubmit(e);
            }} {...rest}>
            {children}
        </form>
    );
}

module.exports = { Field, Input, Textarea, Select, Check, Range, InputGroup, Form };
