var React = require('react');
var { useRef, useState, useEffect } = React;

async function dialog(imports) {
    var { bootstrap, $ } = imports;

    return function NavBar(props) {
        const { isOpen, onClose } = props;

        const modalRef = useRef(null);
        const bsRef = useRef(null);
        const [isModalOpen, setModalOpen] = useState(isOpen);

        useEffect(() => {
            setModalOpen(isOpen);
        }, [isOpen]);

        useEffect(() => {
            if (bsRef.current == null) {
                bsRef.current = new bootstrap.bs.Modal(modalRef.current, {
                    focus: true,
                    backdrop: 'static'
                })
            }
            return () => {
                if (!bsRef.current) return;
                bsRef.current.dispose();
                bsRef.current = null;
            }
        }, [modalRef.current]);

        useEffect(() => {
            if (!bsRef.current) return
            if (isModalOpen) {
                bsRef.current.show();
            } else {
                bsRef.current.hide();
            }
        }, [isModalOpen]);

        return (<>
            <div ref={modalRef} className="modal modal-sheet bg-body-secondary">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h1 className="modal-title fs-5">{props.title}</h1>
                            <button
                                type="button"
                                className="btn-close"
                                data-bs-dismiss="modal"
                                aria-label="Close"
                                onClick={() => {
                                    if (onClose)
                                        onClose(true)
                                    else setModalOpen(false);
                                }}></button>
                        </div>
                        <div className="modal-body">
                            {props.children}
                        </div>
                    </div>
                </div>
            </div>
        </>)
    }
}
module.exports = dialog;