var React = require('react');
var { useState } = React;
var { cx, Button, Icon, Badge } = require('./ui');

//the page-shaped examples bootstrap ships that are more than a block: the
//dashboard, the checkout, the cover, the blog. same structure they use, with
//the words taken out and the parts that were static made to work.

//---- dashboard -----------------------------------------------------------

//the bar across the top of a dashboard: what you are looking at on the left,
//what you can do about it on the right
function Toolbar(props) {
    var { title, actions, className } = props;
    return (
        <div className={cx('d-flex justify-content-between flex-wrap flex-md-nowrap',
            'align-items-center pt-3 pb-2 mb-3 border-bottom', className)}>
            <h1 className="h2 mb-0 text-body-emphasis">{title}</h1>
            <div className="btn-toolbar mb-2 mb-md-0 gap-2">{actions}</div>
        </div>
    );
}

//the dashboard's chart, without chart.js. it is a polyline in a viewBox, which
//is all that example draws and costs nothing to ship. colours come from the
//swatch, so it follows the theme like everything else.
function Chart(props) {
    var { data, labels, height, variant, area, className } = props;

    var values = (data || []).map(Number);
    if (values.length < 2) values = [0, 0];

    var W = 600, H = 200, pad = 4;
    var top = Math.max.apply(null, values);
    var bottom = Math.min.apply(null, values);
    var flat = top === bottom;
    var span = flat ? 1 : top - bottom;

    var step = (W - pad * 2) / (values.length - 1);
    var points = values.map(function (v, i) {
        var x = pad + i * step;

        //a run of identical readings is a flat line, and a flat line belongs
        //across the middle. scaled normally it pins to the floor, which reads
        //as zero rather than as steady.
        var at = flat ? 0.5 : (v - bottom) / span;
        var y = pad + (H - pad * 2) * (1 - at);

        return Math.round(x * 10) / 10 + ',' + Math.round(y * 10) / 10;
    });

    var stroke = 'var(--bs-' + (variant || 'primary') + ')';

    return (
        <figure className={cx('mb-0', className)}>
            <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" role="img"
                style={{ width: '100%', height: (height || 220) + 'px', overflow: 'visible' }}
                aria-label={values.length + ' points, ' + bottom + ' to ' + top}>

                {[0, 0.25, 0.5, 0.75, 1].map(function (f) {
                    var y = pad + (H - pad * 2) * f;
                    return <line key={f} x1={pad} x2={W - pad} y1={y} y2={y}
                        stroke="var(--bs-border-color)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
                })}

                {area ? (
                    <polygon points={pad + ',' + (H - pad) + ' ' + points.join(' ') + ' ' + (W - pad) + ',' + (H - pad)}
                        fill={stroke} opacity="0.12" />
                ) : null}

                <polyline points={points.join(' ')} fill="none" stroke={stroke}
                    strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    vectorEffect="non-scaling-stroke" />

                <circle cx={pad + (values.length - 1) * step}
                    cy={pad + (H - pad * 2) * (1 - (flat ? 0.5 : (values[values.length - 1] - bottom) / span))}
                    r="3" fill={stroke} vectorEffect="non-scaling-stroke" />
            </svg>

            {labels && labels.length ? (
                <figcaption className="d-flex justify-content-between small text-body-secondary mt-2">
                    {labels.map(function (l, i) { return <span key={i}>{l}</span>; })}
                </figcaption>
            ) : null}
        </figure>
    );
}

//---- checkout ------------------------------------------------------------

//the cart down the side of the checkout form. it adds up, which the example
//does not: the total there is a number somebody typed.
function Cart(props) {
    var { items, promo, onPromo, currency, className } = props;

    var lines = items || [];
    var subtotal = lines.reduce(function (sum, item) { return sum + (item.price || 0) * (item.count || 1); }, 0);
    var off = promo && promo.off ? promo.off : 0;
    var sign = currency || '$';

    return (
        <div className={className}>
            <h4 className="d-flex justify-content-between align-items-center mb-3">
                <span className="text-primary">Your cart</span>
                <Badge pill variant="primary">{lines.length}</Badge>
            </h4>

            <ul className="list-group mb-3">
                {lines.map(function (item, i) {
                    return (
                        <li className="list-group-item d-flex justify-content-between lh-sm" key={i}>
                            <div>
                                <h6 className="my-0">{item.name}</h6>
                                <small className="text-body-secondary">{item.note}</small>
                            </div>
                            <span className="text-body-secondary">
                                {sign}{((item.price || 0) * (item.count || 1)).toFixed(2)}
                            </span>
                        </li>
                    );
                })}

                {off ? (
                    <li className="list-group-item d-flex justify-content-between bg-body-tertiary">
                        <div className="text-success">
                            <h6 className="my-0">Promo code</h6>
                            <small>{promo.code}</small>
                        </div>
                        <span className="text-success">&minus;{sign}{off.toFixed(2)}</span>
                    </li>
                ) : null}

                <li className="list-group-item d-flex justify-content-between">
                    <span>Total</span>
                    <strong>{sign}{Math.max(0, subtotal - off).toFixed(2)}</strong>
                </li>
            </ul>

            {onPromo ? <PromoCode onApply={onPromo} applied={promo} /> : null}
        </div>
    );
}

function PromoCode(props) {
    var { onApply, applied } = props;
    var [code, setCode] = useState('');

    function submit(e) {
        e.preventDefault();
        onApply(code.trim());
        setCode('');
    }

    return (
        <form className="card p-2" onSubmit={submit}>
            <div className="input-group">
                <input type="text" className="form-control" placeholder="Promo code"
                    aria-label="Promo code" value={code}
                    onChange={function (e) { setCode(e.target.value); }} />
                <Button variant="secondary" type="submit" disabled={!code.trim()}>Redeem</Button>
            </div>
            {applied && applied.code
                ? <small className="text-success mt-1">{applied.code} applied</small>
                : null}
        </form>
    );
}

//the example's form only pretends to validate. this one actually does it, the
//way bootstrap documents: let the browser decide, then show what it decided.
function ValidatedForm(props) {
    var { onSubmit, className, children } = props;
    var [tried, setTried] = useState(false);

    function submit(e) {
        e.preventDefault();
        setTried(true);
        if (e.target.checkValidity() && onSubmit) onSubmit(e);
    }

    return (
        <form className={cx('needs-validation', tried && 'was-validated', className)}
            noValidate onSubmit={submit}>
            {children}
        </form>
    );
}

//---- cover ---------------------------------------------------------------

//the whole-window one. this app already owns the window, so it is rendered
//into a box rather than over the top of everything.
function Cover(props) {
    var { brand, nav, active, onSelect, title, lead, action, footer, className } = props;
    return (
        <div className={cx('d-flex flex-column h-100 p-4 text-center rounded-3',
            'text-bg-dark', className)} style={{ minHeight: '30rem' }}>

            <header className="mb-auto">
                <div className="d-flex flex-column flex-md-row align-items-center">
                    <h3 className="float-md-start mb-0">{brand}</h3>
                    <nav className="nav nav-masthead justify-content-center ms-md-auto">
                        {(nav || []).map(function (item) {
                            return (
                                <a key={item.id} role="button"
                                    className={cx('nav-link fw-bold py-1 px-2',
                                        active === item.id ? 'text-white' : 'text-white-50')}
                                    onClick={function () { if (onSelect) onSelect(item.id); }}>
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <main className="px-3 my-5">
                <h1 className="display-5 fw-bold">{title}</h1>
                <p className="lead">{lead}</p>
                {action}
            </main>

            <footer className="mt-auto text-white-50">{footer}</footer>
        </div>
    );
}

//---- blog ----------------------------------------------------------------

function Masthead(props) {
    var { left, brand, right, className } = props;
    return (
        <div className={cx('row flex-nowrap justify-content-between align-items-center border-bottom lh-1 py-3', className)}>
            <div className="col-4 pt-1 small">{left}</div>
            <div className="col-4 text-center">
                <span className="blog-header-logo text-body-emphasis fs-4 fw-bold">{brand}</span>
            </div>
            <div className="col-4 d-flex justify-content-end align-items-center gap-2">{right}</div>
        </div>
    );
}

//the featured post: a card that is one big link, which is what stretched-link
//is for
function FeaturedPost(props) {
    var { post, onOpen, className } = props;
    return (
        <div className={cx('row g-0 border rounded overflow-hidden flex-md-row mb-4 shadow-sm h-md-250 position-relative', className)}>
            <div className="col p-4 d-flex flex-column position-static">
                <strong className={'d-inline-block mb-2 text-' + (post.tone || 'primary') + '-emphasis'}>
                    {post.tag}
                </strong>
                <h3 className="mb-0 text-body-emphasis">{post.title}</h3>
                <div className="mb-1 text-body-secondary small">{post.date}</div>
                <p className="card-text mb-auto">{post.summary}</p>
                <a role="button" className="icon-link gap-1 stretched-link mt-2"
                    onClick={function () { if (onOpen) onOpen(post); }}>
                    Continue reading <Icon name="chevron-right" />
                </a>
            </div>
            <div className="col-auto d-none d-lg-block">
                <div className="bg-body-tertiary d-flex align-items-center justify-content-center"
                    style={{ width: '200px', height: '100%' }}>
                    <Icon name={post.icon || 'file-text'} size="40" className="text-body-secondary" />
                </div>
            </div>
        </div>
    );
}

function Post(props) {
    var { title, meta, children, className } = props;
    return (
        <article className={cx('blog-post mb-5', className)}>
            <h2 className="display-6 link-body-emphasis mb-1">{title}</h2>
            <p className="blog-post-meta text-body-secondary">{meta}</p>
            {children}
        </article>
    );
}

//the blog's right-hand column: about, then lists of links
function Aside(props) {
    var { about, groups, className } = props;
    return (
        <div className={cx('position-sticky', className)} style={{ top: '2rem' }}>
            {about ? (
                <div className="p-4 mb-3 bg-body-tertiary rounded">
                    <h4 className="fst-italic text-body-emphasis">About</h4>
                    <p className="mb-0">{about}</p>
                </div>
            ) : null}

            {(groups || []).map(function (group, i) {
                return (
                    <div key={i} className={i ? 'mt-3' : ''}>
                        <h4 className="fst-italic text-body-emphasis">{group.title}</h4>
                        <ul className="list-unstyled mb-0">
                            {group.items.map(function (item, j) {
                                return (
                                    <li key={j}>
                                        <a role="button" className="d-block py-1 text-decoration-none"
                                            onClick={function () { if (group.onSelect) group.onSelect(item); }}>
                                            {item.label || item}
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}

module.exports = { Toolbar, Chart, Cart, ValidatedForm, Cover, Masthead, FeaturedPost, Post, Aside };
