var React = require('react');
var { cx, Icon } = require('./ui');

//navigation: the bars, the tabs, and the trails.

function Navbar(props) {
    var { brand, expand, fixed, className, children, right } = props;
    return (
        <nav className={cx('navbar', 'navbar-expand-' + (expand || 'lg'),
            fixed && 'fixed-' + fixed, 'bg-body-tertiary', className)}>
            <div className="container-fluid">
                {brand ? <span className="navbar-brand mb-0 h1">{brand}</span> : null}
                {children ? (
                    <div className="collapse navbar-collapse show">
                        <ul className="navbar-nav me-auto mb-0">{children}</ul>
                    </div>
                ) : <div className="me-auto" />}
                {right}
            </div>
        </nav>
    );
}

function NavItem(props) {
    var { active, disabled, icon, onClick, children } = props;
    return (
        <li className="nav-item">
            <a className={cx('nav-link', active && 'active', disabled && 'disabled')} role="button"
                aria-current={active ? 'page' : undefined}
                onClick={disabled ? undefined : onClick}>
                {icon ? <Icon name={icon} className="me-1" /> : null}{children}
            </a>
        </li>
    );
}

//tabs and pills differ by one class, so they are one component
function Tabs(props) {
    var { items, active, onSelect, pills, className } = props;
    return (
        <ul className={cx('nav', pills ? 'nav-pills' : 'nav-tabs', className)} role="tablist">
            {items.map(function (item) {
                var id = item.id || item;
                var label = item.label || item;
                return (
                    <li className="nav-item" key={id} role="presentation">
                        <button type="button" role="tab" aria-selected={active === id}
                            className={cx('nav-link', active === id && 'active')}
                            onClick={function () { if (onSelect) onSelect(id); }}>
                            {item.icon ? <Icon name={item.icon} className="me-1" /> : null}{label}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

function Breadcrumb(props) {
    var { items, className } = props;
    return (
        <nav aria-label="breadcrumb" className={className}>
            <ol className="breadcrumb mb-0">
                {items.map(function (item, i) {
                    var last = i === items.length - 1;
                    var label = item.label || item;
                    return (
                        <li key={i} className={cx('breadcrumb-item', last && 'active')}
                            aria-current={last ? 'page' : undefined}>
                            {last ? label : <a role="button" onClick={item.onClick}>{label}</a>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function Pagination(props) {
    var { page, pages, onSelect, size, className } = props;
    var numbers = [];
    for (var i = 1; i <= pages; i++) numbers.push(i);

    function go(n) { if (n >= 1 && n <= pages && onSelect) onSelect(n); }

    return (
        <nav className={className}>
            <ul className={cx('pagination', size && 'pagination-' + size, 'mb-0')}>
                <li className={cx('page-item', page <= 1 && 'disabled')}>
                    <a className="page-link" role="button" onClick={function () { go(page - 1); }}>Previous</a>
                </li>
                {numbers.map(function (n) {
                    return (
                        <li key={n} className={cx('page-item', n === page && 'active')}>
                            <a className="page-link" role="button" onClick={function () { go(n); }}>{n}</a>
                        </li>
                    );
                })}
                <li className={cx('page-item', page >= pages && 'disabled')}>
                    <a className="page-link" role="button" onClick={function () { go(page + 1); }}>Next</a>
                </li>
            </ul>
        </nav>
    );
}

//the dashboard example's sidebar, as a component
function Sidebar(props) {
    var { items, active, onSelect, header, footer, className } = props;
    return (
        <div className={cx('d-flex flex-column flex-shrink-0 p-3 border-end bg-body-tertiary', className)}>
            {header ? <div className="mb-3">{header}</div> : null}
            <ul className="nav nav-pills flex-column mb-auto">
                {items.map(function (item) {
                    return (
                        <li className="nav-item" key={item.id}>
                            <a className={cx('nav-link', active === item.id && 'active')} role="button"
                                onClick={function () { if (onSelect) onSelect(item.id); }}>
                                {item.icon ? <Icon name={item.icon} className="me-2" /> : null}
                                {item.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
            {footer ? <div className="mt-3 border-top pt-3 small text-body-secondary">{footer}</div> : null}
        </div>
    );
}

module.exports = { Navbar, NavItem, Tabs, Breadcrumb, Pagination, Sidebar };
