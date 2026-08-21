var React = require('react');
var { useState, useEffect } = React;
var { cx, Button, Card, Icon } = require('./ui');

//the page-shaped examples — heroes, footers, pricing, album — as components
//rather than as markup to copy. each is the same structure bootstrap ships,
//with the words taken out.

function Page(props) {
    var { sidebar, header, footer, className, children } = props;
    var [sections, setSections] = useState([]);

    //what the page turned out to contain, read back off the dom rather than
    //declared twice. a page says what its sections are by rendering them, and
    //anything that wants to list them -- a sidebar, a rail -- asks here.
    //
    //no dependency array on purpose: it runs after every render and only moves
    //the state when the list actually changed, so it settles in one pass.
    useEffect(function () {
        var found = Array.prototype.slice
            .call(document.querySelectorAll('main section[data-section]'))
            .map(function (el) { return { id: el.id, title: el.getAttribute('data-section') }; });

        setSections(function (was) {
            var same = was.length === found.length && was.every(function (s, i) {
                return s.id === found[i].id;
            });
            return same ? was : found;
        });
    });

    return (
        <div className={cx('d-flex flex-column vh-100', className)}>
            {header}
            <div className="d-flex flex-grow-1 overflow-hidden">
                {typeof sidebar == 'function' ? sidebar(sections) : sidebar}
                <main className="flex-grow-1 overflow-auto p-4">{children}</main>
            </div>
            {footer}
        </div>
    );
}

//a title is enough of an anchor for a page this size
function slug(title) {
    return 's-' + String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

//headings do not follow the body colour on their own. bootstrap points them at
//--bs-heading-color, and a swatch is free to pin that to one value and never
//mention it again -- lux sets #1a1a1a at :root and says nothing about dark, so
//in dark mode its headings came out #1a1a1a on #1a1a1a, a contrast ratio of
//exactly 1. text-body-emphasis is the utility that tracks the mode, so every
//heading this kit renders wears it.
function Section(props) {
    var { title, lead, aside, className, children } = props;
    return (
        <section className={cx('mb-5', className)}
            id={title ? slug(title) : undefined}
            data-section={title || undefined}>
            {title ? (
                <div className="d-flex align-items-center justify-content-between border-bottom pb-2 mb-3">
                    <div>
                        <h4 className="mb-0 text-body-emphasis">{title}</h4>
                        {lead ? <p className="text-body-secondary mb-0 small">{lead}</p> : null}
                    </div>
                    {aside}
                </div>
            ) : null}
            {children}
        </section>
    );
}

function Hero(props) {
    var { title, lead, actions, icon, className } = props;
    return (
        <div className={cx('p-5 mb-4 bg-body-tertiary rounded-3', className)}>
            <div className="container-fluid py-3">
                {icon ? <Icon name={icon} size="48" className="mb-3 text-primary" /> : null}
                <h1 className="display-6 fw-bold text-body-emphasis">{title}</h1>
                {lead ? <p className="col-md-8 fs-5 text-body-secondary">{lead}</p> : null}
                {actions}
            </div>
        </div>
    );
}

function Footer(props) {
    var { left, right, className } = props;
    return (
        <footer className={cx('d-flex justify-content-between align-items-center',
            'border-top px-4 py-2 small theme-surface', className)}>
            <span>{left}</span>
            <span>{right}</span>
        </footer>
    );
}

//a section's worth of content in a card, for blocks small enough that a page
//heading and a rule over the top of them weighs more than they do. four of
//these fill a window that four Sections leave half empty.
function Panel(props) {
    var { title, lead, aside, className, children } = props;
    return (
        <div className={cx('card h-100', className)}>
            {title ? (
                <div className="card-header d-flex align-items-center justify-content-between gap-2">
                    <div className="min-w-0">
                        <span className="fw-semibold text-body-emphasis">{title}</span>
                        {lead ? <div className="small text-body-secondary">{lead}</div> : null}
                    </div>
                    {aside}
                </div>
            ) : null}
            <div className="card-body">{children}</div>
        </div>
    );
}

//side by side rather than stacked, and back to stacked when there is no room
function Columns(props) {
    var { of, className, children } = props;
    return (
        <div className={cx('row g-4 row-cols-1', 'row-cols-xl-' + (of || 2), className)}>
            {React.Children.map(children, function (child) {
                return child ? <div className="col">{child}</div> : null;
            })}
        </div>
    );
}

//the features example: a row of icon, heading, text
function Features(props) {
    var { items, columns, className } = props;
    return (
        <div className={cx('row g-4', 'row-cols-1', 'row-cols-md-' + (columns || 3), className)}>
            {items.map(function (item, i) {
                return (
                    <div className="col" key={i}>
                        <div className="d-flex align-items-start">
                            <div className="text-primary me-3 pt-1"><Icon name={item.icon} size="24" /></div>
                            <div>
                                <h5 className="mb-1">{item.title}</h5>
                                <p className="text-body-secondary mb-0 small">{item.text}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

//the pricing example
function Pricing(props) {
    var { plans, onChoose, className } = props;
    return (
        <div className={cx('row row-cols-1 row-cols-md-3 g-4 text-center', className)}>
            {plans.map(function (plan) {
                return (
                    <div className="col" key={plan.name}>
                        <div className={cx('card h-100', plan.featured && 'border-primary')}>
                            <div className={cx('card-header py-3', plan.featured && 'text-bg-primary')}>
                                <h4 className="my-0 fw-normal">{plan.name}</h4>
                            </div>
                            <div className="card-body d-flex flex-column">
                                <h1 className="card-title">{plan.price}
                                    <small className="text-body-secondary fw-light fs-6">{plan.per || '/mo'}</small>
                                </h1>
                                <ul className="list-unstyled mt-3 mb-4 text-body-secondary">
                                    {plan.features.map(function (f, i) { return <li key={i}>{f}</li>; })}
                                </ul>
                                <Button className="w-100 mt-auto" variant="primary" outline={!plan.featured}
                                    onClick={function () { if (onChoose) onChoose(plan); }}>
                                    {plan.action || 'Choose'}
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

//the album example: a responsive grid of cards
function Album(props) {
    var { items, columns, onOpen, className } = props;
    return (
        <div className={cx('row row-cols-1 g-4', 'row-cols-md-' + (columns || 3), className)}>
            {items.map(function (item, i) {
                return (
                    <div className="col" key={i}>
                        <Card className="h-100" title={item.title}
                            footer={
                                <div className="d-flex justify-content-between align-items-center">
                                    <Button size="sm" outline variant="secondary"
                                        onClick={function () { if (onOpen) onOpen(item); }}>View</Button>
                                    <small>{item.meta}</small>
                                </div>
                            }>
                            <p className="card-text text-body-secondary small mb-0">{item.text}</p>
                        </Card>
                    </div>
                );
            })}
        </div>
    );
}

//the dashboard example's little number tiles
function Stats(props) {
    var { items, className } = props;
    return (
        <div className={cx('row g-3', className)}>
            {items.map(function (item, i) {
                return (
                    <div className="col-6 col-lg-3" key={i}>
                        <div className="card h-100">
                            <div className="card-body py-3">
                                <div className="d-flex align-items-center justify-content-between">
                                    <span className="text-body-secondary small text-uppercase">{item.label}</span>
                                    {item.icon ? <Icon name={item.icon} className="text-body-secondary" /> : null}
                                </div>
                                <div className="fs-4 fw-semibold">{item.value}</div>
                                {item.hint ? <div className="small text-body-secondary">{item.hint}</div> : null}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

module.exports = { Page, Section, Panel, Columns, Hero, Footer, Features, Pricing, Album, Stats };
