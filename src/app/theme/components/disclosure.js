var React = require('react');
var { useRef, useEffect } = React;
var { cx } = require('./ui');

//things that show and hide their own contents.
//
//accordion and collapse ride on bootstrap's data attributes, which need no
//instance — only unique ids, so several can sit on one page without driving
//each other. the carousel does need one.

var seq = 0;
function useId(prefix) {
    var id = useRef(null);
    if (!id.current) id.current = prefix + (++seq);
    return id.current;
}

function makeDisclosure(kit) {

    function Accordion(props) {
        var { items, flush, alwaysOpen, className } = props;
        var id = useId('accordion');
        return (
            <div className={cx('accordion', flush && 'accordion-flush', className)} id={id}>
                {items.map(function (item, i) {
                    var target = id + '-' + i;
                    return (
                        <div className="accordion-item" key={i}>
                            <h2 className="accordion-header">
                                <button className={cx('accordion-button', !item.open && 'collapsed')} type="button"
                                    data-bs-toggle="collapse" data-bs-target={'#' + target}
                                    aria-expanded={!!item.open}>
                                    {item.title}
                                </button>
                            </h2>
                            <div id={target} className={cx('accordion-collapse collapse', item.open && 'show')}
                                data-bs-parent={alwaysOpen ? undefined : '#' + id}>
                                <div className="accordion-body">{item.body}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    function Collapse(props) {
        var { label, variant, open, className, children } = props;
        var id = useId('collapse');
        return (
            <div className={className}>
                <button className={cx('btn', 'btn-' + (variant || 'secondary'))} type="button"
                    data-bs-toggle="collapse" data-bs-target={'#' + id} aria-expanded={!!open}>
                    {label}
                </button>
                <div className={cx('collapse mt-2', open && 'show')} id={id}>
                    <div className="card card-body">{children}</div>
                </div>
            </div>
        );
    }

    function Carousel(props) {
        var { slides, interval, controls, indicators, className } = props;
        var id = useId('carousel');
        var el = useRef(null);

        useEffect(function () {
            if (!el.current) return;
            var instance = new kit.Carousel(el.current, { interval: interval || 4000 });
            return function () {
                try { instance.dispose(); } catch (e) { /* the node went first */ }
            };
        }, []);

        return (
            <div ref={el} id={id} className={cx('carousel slide', className)}>
                {indicators !== false ? (
                    <div className="carousel-indicators">
                        {slides.map(function (s, i) {
                            return <button key={i} type="button" data-bs-target={'#' + id} data-bs-slide-to={i}
                                className={i === 0 ? 'active' : ''} aria-label={'Slide ' + (i + 1)} />;
                        })}
                    </div>
                ) : null}

                <div className="carousel-inner rounded">
                    {slides.map(function (s, i) {
                        return (
                            <div className={cx('carousel-item', i === 0 && 'active')} key={i}>
                                <div className={cx('d-flex align-items-center justify-content-center',
                                    s.className || 'bg-body-secondary')} style={{ height: '12rem' }}>
                                    {s.body}
                                </div>
                                {s.caption ? (
                                    <div className="carousel-caption d-none d-md-block">
                                        <h5>{s.caption}</h5>
                                        {s.text ? <p>{s.text}</p> : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {controls !== false ? [
                    <button key="prev" className="carousel-control-prev" type="button"
                        data-bs-target={'#' + id} data-bs-slide="prev">
                        <span className="carousel-control-prev-icon" aria-hidden="true" />
                        <span className="visually-hidden">Previous</span>
                    </button>,
                    <button key="next" className="carousel-control-next" type="button"
                        data-bs-target={'#' + id} data-bs-slide="next">
                        <span className="carousel-control-next-icon" aria-hidden="true" />
                        <span className="visually-hidden">Next</span>
                    </button>
                ] : null}
            </div>
        );
    }

    return { Accordion, Collapse, Carousel };
}

module.exports = makeDisclosure;
