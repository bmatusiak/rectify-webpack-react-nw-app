var React = require('react');
var { useState, useEffect, useCallback } = React;

//---------------------------------------------------------------------------
//WHAT A TOOL CAN REACH, ON ONE SCREEN.
//
//THE MARKS ANSWER THIS ONE CONTROL AT A TIME AND THAT IS NOT ENOUGH. A ring
//round a button tells you about that button while you are looking at it; the
//question somebody actually has is "what can the thing driving my app touch",
//and the only honest answer to that is a list. Twenty pages of controls cannot
//be audited by walking them.
//
//IT IS ALSO THE HALF THE MARKS CANNOT DO AT ALL. A command has no pixels. The
//control socket and the MCP tools are reachable with nothing on screen at all,
//and until this page there was nowhere they were written down.
//
//---- why it is a plugin of its own -----------------------------------------
//
//../../core/may/window.js SAYS PLAINLY WHY IT WILL NOT DRAW THIS: it holds the
//permission prompt, and a prompt that can be replaced along with the theme is
//not a prompt -- so it consumes no theme and builds its dialog out of plain dom.
//A page has no such duty and every reason to look like the rest of the app, so
//it consumes `theme` and lives under ui/, where CLAUDE.md puts what is on
//screen. core does not consume ui; ui consumes core.
//
//DELETING THIS LEAVES THE STANCE ENFORCED AND NOBODY ABLE TO SEE IT, which is
//the same trade ../../core/pages makes about its own registry: the rule is
//core's and the drawing is not.
//
//---- nothing here is a copy ------------------------------------------------
//
//Every number on this page comes from ../../core/may, which got it from
//../../../stance.js and ../../../config.js. A page that re-derived "what is
//open" from the config would be a second opinion, and the day the two disagree
//is the day this screen starts lying about the one thing it exists to say.
//---------------------------------------------------------------------------

plugin.consumes = ['react', 'theme', 'pages', 'may', 'Plugin'];
plugin.provides = [];
async function plugin(imports, register) {
    var { theme, pages, may } = imports;
    var self = new imports.Plugin('ui/reachable');

    var { Section, Table, Alert, Badge, Icon } = theme.ui;

    function ReachablePage() {
        //THE MIRROR, NOT A QUESTION. ../../core/may/window.js keeps what main
        //pushed, so this renders on the first frame -- and null means it has not
        //arrived yet, which is a different thing from "this build reaches
        //nothing" and has to read differently, or it is alarming for a frame.
        var [reach, setReach] = useState(function () { return may.reach(); });

        //AND WHAT IS MARKED ON THE SCREEN RIGHT NOW, which main cannot know. The
        //regions are in the markup of whatever page is mounted, so this is the
        //one number here that is read off the document.
        var [regions, setRegions] = useState([]);

        var look = useCallback(function () {
            setReach(may.reach());

            var found = [].slice.call(document.querySelectorAll('.is-open'));

            setRegions(found.map(function (el) {
                return {
                    name: el.getAttribute('data-open') || 'unnamed',
                    element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
                    controls: el.querySelectorAll('button, a, input, select, textarea').length
                };
            }));
        }, []);

        useEffect(function () {
            look();
            return may.onChange(look);
        }, [look]);

        var closed = may.closed();
        var lists = (reach && reach.lists) || {};
        var stale = (reach && reach.stale) || {};

        function names(kind) {
            var list = lists[kind] || [];
            if (!list.length) return <span className="text-body-secondary">nothing</span>;

            return (
                <span className="d-inline-flex flex-wrap gap-1">
                    {list.map(function (name) {
                        //A NAME NOTHING REGISTERS IS THE ONE DRIFT A LIST OF
                        //NAMES INVITES, and it is worth drawing rather than
                        //hiding: it says the config is promising something that
                        //no longer exists, which is how somebody comes to
                        //believe a tool can do a thing it cannot.
                        var gone = (stale[kind] || []).indexOf(name) >= 0;

                        return (
                            <Badge key={name} bg={gone ? 'warning' : 'secondary'}>
                                <code className="text-reset">{name}</code>
                                {gone ? ' - nothing registers this' : null}
                            </Badge>
                        );
                    })}
                </span>
            );
        }

        return (
            <>
                <Section title="What a tool can reach" id="stance"
                    lead={closed ? 'this build is closed' : 'this build is open'}>

                    {closed ? (
                        <Alert variant="warning" className="d-flex align-items-start gap-2 mb-0">
                            <Icon name="shield-lock" className="mt-1" />
                            <span>
                                <strong>Closed.</strong> Nothing outside this window can touch the
                                app except what is listed below and what is marked open on screen.
                                There is no dialog: a closed build cannot be opened while it is
                                running, because the stance was decided when the build was made.
                            </span>
                        </Alert>
                    ) : (
                        <Alert variant="danger" className="d-flex align-items-start gap-2 mb-0">
                            <Icon name="robot" className="mt-1" />
                            <span>
                                <strong>Open.</strong> Anything that can reach the control socket
                                can press, fill and read every control in this app, and the lists
                                below are <em>not being consulted</em>. That is what a development
                                build is for. A packaged one is closed unless the manifest says
                                otherwise.
                            </span>
                        </Alert>
                    )}

                    {reach && reach.unreadable ? (
                        <Alert variant="danger" className="d-flex align-items-start gap-2 mt-3 mb-0">
                            <Icon name="exclamation-octagon" className="mt-1" />
                            <span>
                                <strong>The open list could not be read.</strong>{' '}
                                {reach.unreadable}. A closed build in this state reaches nothing at
                                all.
                            </span>
                        </Alert>
                    ) : null}
                </Section>

                <Section title="Over the control socket" id="commands"
                    lead={reach && reach.counts
                        ? (lists.commands || []).length + ' of ' + reach.counts.commands + ' commands'
                        : 'asking...'}>

                    <p className="text-body-secondary">
                        These are the names <code>node src/cli.js</code> and anything else on the
                        control socket may call. In a closed build <code>commands</code> answers
                        only these, and everything else - registered or not - comes back with the
                        same sentence, so the rest cannot be worked out by guessing.
                    </p>

                    <p className="mb-0">{names('commands')}</p>
                </Section>

                <Section title="Over MCP" id="mcp" lead="what a model is shown">
                    <p className="text-body-secondary">
                        Anything not listed here is not in <code>tools/list</code> at all, and
                        calling it by name answers exactly what a tool nobody registered does.
                    </p>

                    {/* NO <tbody> OF OUR OWN. ../theme/components/ui.js wraps
                        whatever it is given in one, and a second inside it is
                        markup no browser accepts -- react says so and carries on
                        drawing, which is why it looked fine. demo/window.test.js
                        is what caught it, by opening every page and treating a
                        console error as a page that did not render. */}
                    <Table className="mb-0">
                        <tr><th className="w-25">Tools</th><td>{names('tools')}</td></tr>
                        <tr><th>Resources</th><td>{names('resources')}</td></tr>
                        <tr><th>Prompts</th><td>{names('prompts')}</td></tr>
                    </Table>
                </Section>

                <Section title="Marked on screen" id="regions"
                    lead={regions.length + ' open '
                        + (regions.length === 1 ? 'region' : 'regions') + ' where you are now'}>

                    {regions.length ? (
                        <Table head={['What', 'Where', 'Controls']}>
                            {regions.map(function (one, i) {
                                return (
                                    <tr key={one.name + i}>
                                        <td>{one.name}</td>
                                        <td><code>{one.element}</code></td>
                                        <td className="text-end">{one.controls}</td>
                                    </tr>
                                );
                            })}
                        </Table>
                    ) : (
                        <p className="text-body-secondary">
                            {closed
                                ? 'Nothing on this page is marked open, so a tool can be told what '
                                    + 'these controls are and cannot press, fill, or read the value '
                                    + 'of any of them.'
                                : 'Nothing is marked, because in an open build everything is '
                                    + 'reachable and a ring round three controls would read as '
                                    + '"and nothing else". The marks appear when the build is '
                                    + 'closed.'}
                        </p>
                    )}

                    <Alert variant="info" className="d-flex align-items-start gap-2 mb-0">
                        <Icon name="info-circle" className="mt-1" />
                        <span>
                            This counts what is <strong>mounted right now</strong>. A region on a
                            page you have not opened is not in it - the lists above are the whole of
                            what is reachable without a screen, and this is the part that depends on
                            which one you are looking at.
                        </span>
                    </Alert>
                </Section>
            </>
        );
    }

    var added = pages.add({
        id: 'reachable',
        label: 'Reachable',
        icon: 'robot',
        Page: ReachablePage
    });

    self.own(added.remove);

    await register(null, { onDestroy: self.unload });
}
module.exports = plugin;
