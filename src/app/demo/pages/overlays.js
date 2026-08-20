var React = require('react');
var { useState } = React;

module.exports = function Overlays(props) {
    var { theme, toast, io } = props;
    var { Section, Panel, Columns, Modal, Offcanvas, Tip, Dropdown,
        Button, Card, Badge, Alert, Input, Table } = theme.ui;

    var [modal, setModal] = useState(false);
    var [confirm, setConfirm] = useState(false);
    var [drawer, setDrawer] = useState(false);
    var [placement, setPlacement] = useState('start');
    var [note, setNote] = useState('');
    var [chosen, setChosen] = useState('none yet');

    return (
        <>
            {/*four small blocks. stacked as four Sections they used half the
               window and left the rest blank; two columns of panels fill it
               and spend one page heading instead of four.*/}
            <Section title="Overlays" lead="the parts with bootstrap's javascript behind them">
              <Columns of={2}>
                <Panel title="Dialogs and toasts" lead="each one opens something real">
                <div className="d-flex flex-wrap gap-2">
                    <Button icon="window" onClick={function () { setModal(true); }}>Open a modal</Button>
                    <Button variant="secondary" icon="question-circle"
                        onClick={function () { setConfirm(true); }}>Ask something</Button>
                    <Button variant="secondary" outline icon="layout-sidebar"
                        onClick={function () { setDrawer(true); }}>Open the drawer</Button>
                    <Button variant="success" outline icon="bell"
                        onClick={function () { toast('a toast, from a button', 'success', 'bell'); }}>Toast</Button>
                    <Button variant="danger" outline icon="exclamation-triangle"
                        onClick={function () { toast('and one that means it', 'danger', 'exclamation-triangle'); }}>
                        Loud toast
                    </Button>
                </div>
                </Panel>

                <Panel title="Tooltips and popovers" lead="hover the first, click the second">
                <div className="d-flex flex-wrap gap-2 align-items-center">
                    <Tip title="On top"><Button outline variant="secondary">Top</Button></Tip>
                    <Tip title="On the right" placement="right"><Button outline variant="secondary">Right</Button></Tip>
                    <Tip title="Underneath" placement="bottom"><Button outline variant="secondary">Bottom</Button></Tip>
                    <Tip title="A popover" popover="With a body of its own, dismissed on blur.">
                        <Button variant="secondary">Popover</Button>
                    </Tip>
                    <Tip title="Even a badge"><Badge variant="info">hover me</Badge></Tip>
                </div>
                </Panel>

                <Panel title="Dropdowns"
                    aside={<span className="small text-body-secondary">picked: {chosen}</span>}>
                <div className="d-flex flex-wrap gap-2">
                    <Dropdown label="Choose one" items={['alpha', 'beta', 'gamma'].map(function (name) {
                        return { label: name, active: chosen === name, onClick: function () { setChosen(name); } };
                    })} />
                    <Dropdown label="Split" variant="secondary" split items={[
                        { label: 'Save', onClick: function () { toast('saved', 'success'); } },
                        '-',
                        { label: 'Discard', onClick: function () { toast('discarded', 'warning'); } }
                    ]} />
                    <Dropdown label="Aligned end" variant="success" align="end" items={[
                        { label: 'One' }, { label: 'Two' }, '-', { label: 'Three' }
                    ]} />
                </div>
                </Panel>

                <Panel title="Offcanvas placement" lead="the drawer, from each of its four sides">
                <div className="d-flex flex-wrap gap-2">
                    {['start', 'end', 'top', 'bottom'].map(function (p) {
                        return (
                            <Button key={p} outline variant="secondary" active={placement === p}
                                onClick={function () { setPlacement(p); setDrawer(true); }}>{p}</Button>
                        );
                    })}
                </div>
                </Panel>
              </Columns>
            </Section>

            <Modal open={modal} onClose={function () { setModal(false); }} title="A modal"
                footer={
                    <>
                        <Button variant="secondary" outline onClick={function () { setModal(false); }}>Close</Button>
                        <Button onClick={function () {
                            setModal(false);
                            toast(note ? 'kept: ' + note : 'nothing typed', 'primary', 'check2');
                        }}>Keep it</Button>
                    </>
                }>
                <p className="text-body-secondary">
                    The close button, the backdrop and the escape key are bootstrap&apos;s. This one tells
                    react when any of them fired, so reopening works.
                </p>
                <Input id="m-note" label="Type something" value={note}
                    onChange={function (e) { setNote(e.target.value); }} />
            </Modal>

            <Modal open={confirm} onClose={function () { setConfirm(false); }} title="Are you sure?" size="sm"
                footer={
                    <>
                        <Button variant="secondary" outline onClick={function () {
                            setConfirm(false); toast('cancelled', 'secondary');
                        }}>No</Button>
                        <Button variant="danger" onClick={function () {
                            setConfirm(false); toast('confirmed', 'danger', 'check2');
                        }}>Yes, do it</Button>
                    </>
                }>
                <p className="mb-0">Nothing happens either way. It is a demo.</p>
            </Modal>

            <Offcanvas open={drawer} onClose={function () { setDrawer(false); }}
                title="Offcanvas" placement={placement}>
                <p className="text-body-secondary">Opened from the {placement}.</p>
                <Card title="It holds anything">
                    <Table small>
                        <tr><td>placement</td><td>{placement}</td></tr>
                        <tr><td>picked</td><td>{chosen}</td></tr>
                    </Table>
                    <Button size="sm" onClick={function () {
                        setDrawer(false); toast('closed from inside', 'primary');
                    }}>Close from inside</Button>
                </Card>
                <Alert variant="secondary" className="mt-3" icon="info-circle">
                    Bootstrap holds the animation and the backdrop; react holds whether it is open.
                </Alert>
            </Offcanvas>
        </>
    );
};
