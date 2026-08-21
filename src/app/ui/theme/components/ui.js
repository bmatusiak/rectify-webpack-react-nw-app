var React = require('react');

//the small pieces: things that are markup and classes, with no javascript
//behind them. every one takes className and the usual props and passes them
//through, so anything not wrapped here is still reachable.

function cx() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
}

function Alert(props) {
    var { variant, dismissible, icon, className, children, ...rest } = props;
    return (
        <div className={cx('alert', 'alert-' + (variant || 'primary'),
            dismissible && 'alert-dismissible fade show', className)} role="alert" {...rest}>
            {icon ? <Icon name={icon} className="me-2" /> : null}
            {children}
            {dismissible ? <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close" /> : null}
        </div>
    );
}

function Badge(props) {
    var { variant, pill, className, children, ...rest } = props;
    return (
        <span className={cx('badge', 'text-bg-' + (variant || 'secondary'), pill && 'rounded-pill', className)} {...rest}>
            {children}
        </span>
    );
}

function Button(props) {
    var { variant, size, outline, active, icon, className, children, ...rest } = props;
    var kind = (outline ? 'btn-outline-' : 'btn-') + (variant || 'primary');
    return (
        <button type="button" className={cx('btn', kind, size && 'btn-' + size, active && 'active', className)} {...rest}>
            {icon ? <Icon name={icon} className={children ? 'me-1' : ''} /> : null}
            {children}
        </button>
    );
}

function ButtonGroup(props) {
    var { vertical, size, className, children, ...rest } = props;
    return (
        <div className={cx(vertical ? 'btn-group-vertical' : 'btn-group', size && 'btn-group-' + size, className)}
            role="group" {...rest}>{children}</div>
    );
}

function Card(props) {
    var { header, footer, title, subtitle, image, className, bodyClassName, children, ...rest } = props;
    return (
        <div className={cx('card', className)} {...rest}>
            {image ? <img src={image} className="card-img-top" alt="" /> : null}
            {header ? <div className="card-header">{header}</div> : null}
            <div className={cx('card-body', bodyClassName)}>
                {title ? <h5 className="card-title">{title}</h5> : null}
                {subtitle ? <h6 className="card-subtitle mb-2 text-body-secondary">{subtitle}</h6> : null}
                {children}
            </div>
            {footer ? <div className="card-footer text-body-secondary">{footer}</div> : null}
        </div>
    );
}

function ListGroup(props) {
    var { flush, numbered, className, children, ...rest } = props;
    var Tag = numbered ? 'ol' : 'ul';
    return (
        <Tag className={cx('list-group', flush && 'list-group-flush', numbered && 'list-group-numbered', className)} {...rest}>
            {children}
        </Tag>
    );
}

function ListItem(props) {
    var { active, disabled, action, variant, className, children, ...rest } = props;
    var Tag = action ? 'button' : 'li';
    return (
        <Tag type={action ? 'button' : undefined}
            className={cx('list-group-item', action && 'list-group-item-action', active && 'active',
                disabled && 'disabled', variant && 'list-group-item-' + variant, className)}
            {...rest}>{children}</Tag>
    );
}

function Table(props) {
    var { striped, hover, bordered, small, responsive, head, className, children, ...rest } = props;
    var table = (
        <table className={cx('table', striped && 'table-striped', hover && 'table-hover',
            bordered && 'table-bordered', small && 'table-sm', className)} {...rest}>
            {head ? <thead><tr>{head.map(function (h, i) { return <th key={i} scope="col">{h}</th>; })}</tr></thead> : null}
            <tbody>{children}</tbody>
        </table>
    );
    return responsive ? <div className="table-responsive">{table}</div> : table;
}

function Spinner(props) {
    var { grow, variant, size, className, label, ...rest } = props;
    return (
        <div className={cx(grow ? 'spinner-grow' : 'spinner-border', variant && 'text-' + variant,
            size && (grow ? 'spinner-grow-' : 'spinner-border-') + size, className)} role="status" {...rest}>
            <span className="visually-hidden">{label || 'Loading...'}</span>
        </div>
    );
}

function Progress(props) {
    var { value, variant, striped, animated, height, label, className, ...rest } = props;
    var pct = Math.max(0, Math.min(100, Number(value) || 0));
    return (
        <div className={cx('progress', className)} role="progressbar" style={height ? { height: height } : null}
            aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" {...rest}>
            <div className={cx('progress-bar', variant && 'text-bg-' + variant,
                striped && 'progress-bar-striped', animated && 'progress-bar-animated')} style={{ width: pct + '%' }}>
                {label ? pct + '%' : null}
            </div>
        </div>
    );
}

function Placeholder(props) {
    var { lines, className } = props;
    var rows = [];
    for (var i = 0; i < (lines || 3); i++) rows.push(i);
    return (
        <p className={cx('placeholder-glow', className)}>
            {rows.map(function (i) {
                return <span key={i} className={'placeholder col-' + (12 - (i % 3) * 2) + ' mb-1'} />;
            })}
        </p>
    );
}

//the sprite is injected once by the theme plugin, so this is just a <use>
function Icon(props) {
    var { name, size, className, ...rest } = props;
    return (
        <svg className={cx('bi', className)} width={size} height={size} aria-hidden="true" {...rest}>
            <use xlinkHref={'#' + name} />
        </svg>
    );
}

module.exports = { cx, Alert, Badge, Button, ButtonGroup, Card, ListGroup, ListItem, Table, Spinner, Progress, Placeholder, Icon };
