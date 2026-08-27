var React = require('react');
var { useState, useEffect, useCallback } = React;

//WHAT THIS APP IS ALLOWED TO DO, AND A WAY TO CHANGE YOUR MIND.
//
//THE ELEMENTS ARE ON Buttons AND Forms; this page is the BEHAVIOUR -- what a
//guarded capability is, who gets asked about it, and what happens to the answer
//afterwards. The two are separate on purpose: a control is a thing you look at,
//and a permission is a thing that persists after you have stopped looking.
//
//`always` WITHOUT A WAY BACK IS A ONE-WAY DOOR, which is the real reason this
//page exists. Offer somebody a permanent yes with no undo and the honest thing
//to do is never press it -- so the easy answer becomes the dangerous one and
//people learn to answer `once` to everything, for ever.
//
//NOTHING HERE IS A MOCK. The rows are what ../../core/may really has, the
//answers are the ones really written in the app's own may.json, and taking one
//back really takes it back.

module.exports = function Guarded(props) {
    var { theme, may, toast } = props;
    var { Section, Button, Badge, Table, Alert, Icon } = theme.ui;

    //THE MIRROR, NOT A QUESTION. ../../core/may/window.js keeps the list main
    //pushes it, so this renders on the first frame -- and main pushes a new one
    //every time a decision changes, which is what keeps the row somebody just
    //pressed from showing the answer it had a moment ago.
    var [rows, setRows] = useState(function () { return may.decisions(); });

    var refresh = useCallback(function () { setRows(may.decisions()); }, [may]);

    useEffect(function () {
        refresh();
        return may.onChange(refresh);
    }, [may, refresh]);

    //THE EVENT GOES WITH IT. Taking a decision back is a decision, so main
    //applies the same rule -- and the only thing that can tell a person's press
    //from a driven one is the flag the browser put on the event itself.
    async function forget(name, event) {
        var out = await may.forget(name, event);

        if (out && out.refused) return toast(out.refused, 'warning', 'shield-lock');
        toast(name + ' is back to nobody having said', 'success', 'arrow-counterclockwise');
    }

    //A PRESS THAT IS NOT A PERSON'S, WITHOUT NEEDING A TERMINAL.
    //
    //`element.click()` DISPATCHES AN UNTRUSTED EVENT -- the browser will not put
    //its own mark on one javascript made, which is the entire mechanism this
    //app's permissions rest on. So this button reaches the guarded one below
    //exactly the way ../../remote/window.js does when the command line drives
    //the app, and the same question comes up.
    //
    //IT IS THE ONE DEMONSTRATION THAT CANNOT BE FAKED: a page that could forge
    //`isTrusted` would be a page proving the opposite of what it claims.
    function drive() {
        var target = document.getElementById('guarded-target');
        if (target) target.click();
    }

    var undecided = may.undecided();

    return (
        <>
            <Section title="A press that is not a person's" id="driven"
                lead="the same button, pressed by you and pressed by something else">

                <p className="text-body-secondary">
                    Press the guarded button yourself and it simply happens &mdash; you are sitting
                    here, and your press is the consent. Press it with the button beside it, which
                    reaches it the way an outside tool does, and{' '}
                    <strong>a question comes up for you to answer</strong>.
                </p>

                <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
                    <Button id="guarded-target" variant="primary" guard="snapshot"
                        onRefused={function (said) { toast(said.why, 'warning', 'shield-lock'); }}
                        onClick={function () { toast('allowed, and it would have run', 'success', 'unlock'); }}>
                        Write the page to a file
                    </Button>

                    <Button outline variant="secondary" icon="robot" onClick={drive}>
                        Press it the way a tool would
                    </Button>
                </div>

                <Alert variant="secondary" className="d-flex align-items-start gap-2 mb-0">
                    <Icon name="info-circle" className="mt-1" />
                    <span>
                        The second button calls <code>element.click()</code>, and the browser will not
                        put its own mark on an event javascript made. That flag &mdash;{' '}
                        <code>event.isTrusted</code> &mdash; is the whole mechanism: it is{' '}
                        <code>false</code> for every synthetic press and cannot be written from a
                        page. <code>node src/cli.js click &quot;Write the page to a file&quot;</code>{' '}
                        arrives by the same road and gets the same question.
                    </span>
                </Alert>
            </Section>

            <Section title="What this app is allowed to do" id="decisions"
                lead="the capabilities the code proposed, and what you have said about each"
                aside={<Badge pill variant="secondary">{rows.length} guarded</Badge>}>

                {rows.length ? (
                    <Table small responsive head={['capability', 'what it is', 'answer', 'kept', '']}>
                        {rows.map(function (one) {
                            return (
                                <tr key={one.name}>
                                    <td className="fw-semibold"><code>{one.name}</code></td>
                                    <td className="text-body-secondary">{one.about || '—'}</td>
                                    <td>
                                        {one.answer
                                            ? <Badge variant={one.answer === 'never' ? 'danger' : 'success'}>
                                                {one.answer === 'never' ? 'never' : 'allowed'}
                                            </Badge>
                                            : <Badge variant="secondary">nobody has said</Badge>}
                                    </td>
                                    <td className="text-body-secondary">
                                        {!one.answer ? '—'
                                            : one.remembered ? 'written down'
                                                : 'until this app closes'}
                                    </td>
                                    <td className="text-end">
                                        {one.answer ? (
                                            <Button size="sm" outline variant="secondary"
                                                icon="arrow-counterclockwise"
                                                onClick={function (e) { forget(one.name, e); }}>
                                                Take it back
                                            </Button>
                                        ) : null}
                                    </td>
                                </tr>
                            );
                        })}
                    </Table>
                ) : (
                    <p className="text-body-secondary mb-0">
                        Nothing is guarded, which means no plugin has declared a capability &mdash;
                        or there is no main half behind this window to hold the list.
                    </p>
                )}

                <Alert variant="secondary" className="d-flex align-items-start gap-2 mt-3 mb-0">
                    <Icon name="shield-lock" className="mt-1" />
                    <span>
                        <strong>The list is the code&rsquo;s, and the answers are yours.</strong> A
                        capability appears here because a plugin called <code>may.declare()</code>{' '}
                        &mdash; so one added tomorrow is guarded from the moment it exists, without
                        anybody editing a file. Only the <em>exceptions</em> are written down, which
                        is why a stored full list would be the wrong way round: it would leave every
                        new guard open and still look correct.
                        {undecided.length ? (
                            <> Nothing has been decided about <code>{undecided.join(', ')}</code>{' '}
                                yet, so the next outside caller asking about one raises a question
                                here.</>
                        ) : null}
                    </span>
                </Alert>
            </Section>

            <Section title="Why you cannot do this from a terminal" id="only-here"
                lead="read from anywhere, set from nowhere but this window">

                <p className="text-body-secondary">
                    <code>node src/cli.js may</code> prints this table. It cannot change a row of
                    it &mdash; neither deciding nor taking one back &mdash; and neither can an MCP
                    tool, a driven click, or anything else reaching in from outside.
                </p>

                <Alert variant="warning" className="d-flex align-items-start gap-2 mb-0">
                    <Icon name="exclamation-triangle" className="mt-1" />
                    <span>
                        <strong>A guard the command line can remove is not a guard.</strong> It is a
                        comment, one call away from nothing &mdash; and every refusal downstream of
                        it becomes a refusal you have to trust a model not to have unlocked first.
                        So an answer is worth exactly what the door it came through is worth, and
                        this is the only door.
                    </span>
                </Alert>
            </Section>
        </>
    );
};
