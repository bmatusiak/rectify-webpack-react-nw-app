var React = require('react');
var { useRef, useState, useEffect } = React;
var { cx, Icon } = require('./ui');

//the parts with javascript behind them.
//
//bootstrap drives these from its own instances, so each one is created against
//a ref on mount and disposed on unmount. anything that only needs a data
//attribute — dropdowns, tab toggles, collapse — is left as markup, because
//bootstrap's delegated handlers already do that work.

function useBootstrap(kit, name, ref, options, deps) {
    var instance = useRef(null);
    useEffect(function () {
        if (!ref.current) return;
        instance.current = new kit[name](ref.current, options || {});
        return function () {
            try { instance.current.dispose(); } catch (e) { /* the node went first */ }
            instance.current = null;
        };
    }, deps || []);
    return instance;
}

function makeOverlays(kit) {

    function Modal(props) {
        var { open, onClose, title, footer, size, scrollable, children } = props;
        var el = useRef(null);
        var bs = useBootstrap(kit, 'Modal', el, { focus: true, backdrop: 'static' }, []);

        useEffect(function () {
            if (!bs.current) return;
            if (open) bs.current.show(); else bs.current.hide();
        }, [open]);

        //the close button and the escape key are bootstrap's, so the owner of
        //`open` has to hear about them or the next open is a no-op
        useEffect(function () {
            var node = el.current;
            if (!node || !onClose) return;
            var handler = function () { onClose(); };
            node.addEventListener('hidden.bs.modal', handler);
            return function () { node.removeEventListener('hidden.bs.modal', handler); };
        }, [onClose]);

        return (
            <div ref={el} className="modal fade" tabIndex="-1">
                <div className={cx('modal-dialog', size && 'modal-' + size,
                    scrollable && 'modal-dialog-scrollable', 'modal-dialog-centered')}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h1 className="modal-title fs-5">{title}</h1>
                            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                        </div>
                        <div className="modal-body">{children}</div>
                        {footer ? <div className="modal-footer">{footer}</div> : null}
                    </div>
                </div>
            </div>
        );
    }

    function Offcanvas(props) {
        var { open, onClose, title, placement, children } = props;
        var el = useRef(null);
        var bs = useBootstrap(kit, 'Offcanvas', el, {}, []);

        useEffect(function () {
            if (!bs.current) return;
            if (open) bs.current.show(); else bs.current.hide();
        }, [open]);

        useEffect(function () {
            var node = el.current;
            if (!node || !onClose) return;
            var handler = function () { onClose(); };
            node.addEventListener('hidden.bs.offcanvas', handler);
            return function () { node.removeEventListener('hidden.bs.offcanvas', handler); };
        }, [onClose]);

        return (
            <div ref={el} className={cx('offcanvas', 'offcanvas-' + (placement || 'start'))} tabIndex="-1">
                <div className="offcanvas-header">
                    <h5 className="offcanvas-title">{title}</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
                </div>
                <div className="offcanvas-body">{children}</div>
            </div>
        );
    }

    //toasts are a list rather than a component: one container, many messages
    function Toasts(props) {
        var { items, onDismiss } = props;
        return (
            <div className="toast-container position-fixed bottom-0 end-0 p-3">
                {items.map(function (t) {
                    return (
                        <div key={t.id} className={cx('toast show align-items-center border-0',
                            t.variant && 'text-bg-' + t.variant)} role="alert">
                            <div className="d-flex">
                                <div className="toast-body">
                                    {t.icon ? <Icon name={t.icon} className="me-2" /> : null}{t.message}
                                </div>
                                <button type="button" className="btn-close btn-close-white me-2 m-auto"
                                    onClick={function () { if (onDismiss) onDismiss(t.id); }} aria-label="Close" />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    //wraps whatever it is given, so it works on a button, a badge, anything
    function Tip(props) {
        var { title, placement, popover, children } = props;
        var el = useRef(null);
        useBootstrap(kit, popover ? 'Popover' : 'Tooltip', el, {
            title: title,
            content: popover,
            placement: placement || 'top',
            trigger: popover ? 'focus' : 'hover focus'
        }, [title, popover]);

        return React.cloneElement(React.Children.only(children), { ref: el, tabIndex: popover ? 0 : undefined });
    }

    function Dropdown(props) {
        var { label, variant, items, align, split } = props;
        return (
            <div className="btn-group">
                {split ? <button type="button" className={'btn btn-' + (variant || 'primary')}>{label}</button> : null}
                <button type="button" data-bs-toggle="dropdown" aria-expanded="false"
                    className={cx('btn', 'btn-' + (variant || 'primary'), 'dropdown-toggle',
                        split && 'dropdown-toggle-split')}>
                    {split ? <span className="visually-hidden">Toggle</span> : label}
                </button>
                <ul className={cx('dropdown-menu', align === 'end' && 'dropdown-menu-end')}>
                    {items.map(function (item, i) {
                        if (item === '-') return <li key={i}><hr className="dropdown-divider" /></li>;
                        return (
                            <li key={i}>
                                <a className={cx('dropdown-item', item.active && 'active')} role="button"
                                    onClick={item.onClick}>{item.label}</a>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    return { Modal, Offcanvas, Toasts, Tip, Dropdown };
}

module.exports = makeOverlays;
