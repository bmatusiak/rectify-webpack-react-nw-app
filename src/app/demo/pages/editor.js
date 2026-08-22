var React = require('react');
var { useState, useEffect } = React;

//WHY AN EDITOR AND NOT A <pre>, AND IT IS AN ARGUMENT ABOUT READING RATHER THAN
//ABOUT LOOKS.
//
//A hundred lines of undifferentiated JavaScript is not something a person reads.
//It is something a person scrolls past and then approves anyway, which defeats
//the whole point of putting it on the screen. The plugin next door exists for
//the two things in an app like this that are read closely enough for a decision
//to hang on them: a script somebody has to approve, and a diff somebody has to
//judge.
//
//AND WHY THE DEFAULT IS PLAIN TEXT. The mode panel below is the honest half of
//that argument: highlighting prose as JavaScript colours `delete`, `do`, `in`
//and `that` at random, which is false emphasis on the one document somebody has
//to read every line of. So `text` is the default and a mode is asked for.

var SAMPLES = {
    javascript: {
        mode: 'javascript',
        label: 'JavaScript',
        hint: 'a plugin, which is what everything in src/app looks like',
        text: [
            "//src/app/my-thing/server.js",
            "plugin.consumes = ['app', 'ipc'];",
            "plugin.provides = ['my-thing'];",
            "",
            "async function plugin(imports, register) {",
            "    var answered = imports.ipc.handle('my-thing', async function (data) {",
            "        return { ok: true, saw: data };",
            "    });",
            "",
            "    imports.app.host.router.get('/api/my-thing', function (req, res) {",
            "        res.json({ ok: true });",
            "    });",
            "",
            "    await register(null, {",
            "        'my-thing': {},",
            "        //this half is torn down and rebuilt on every save, so a",
            "        //listener left behind is a second copy answering next time",
            "        onDestroy: function () { answered.remove(); }",
            "    });",
            "}",
            "module.exports = plugin;"
        ].join('\n')
    },

    diff: {
        mode: 'diff',
        label: 'Diff',
        hint: 'the change that made this page possible',
        text: [
            "diff --git a/webpack.config.js b/webpack.config.js",
            "--- a/webpack.config.js",
            "+++ b/webpack.config.js",
            "@@ -34,11 +34,18 @@",
            "     const stylesheets = {",
            "         test: /\\.css$/i,",
            "+        include: swatchSources,",
            "         type: 'asset/resource',",
            "         generator: {",
            "@@ -46,6 +53,12 @@",
            "     };",
            " ",
            "+    const pluginStyles = {",
            "+        test: /\\.css$/i,",
            "+        exclude: swatchSources,",
            "+        use: ['style-loader', 'css-loader']",
            "+    };",
            "+",
            "     const windowBundle = {",
            "-        //every .css was named for the swatch folder it came from",
            "-        //and one that came from none was named swatch-default.css",
            "+        //two kinds of .css, and they must not share a rule",
            "     };"
        ].join('\n')
    },

    markdown: {
        mode: 'markdown',
        label: 'Markdown',
        hint: 'source, for when the rendering is the thing in question',
        text: [
            "# ui/editor",
            "",
            "Code that is **read**.",
            "",
            "| file | provides | consumes |",
            "|---|---|---|",
            "| `window.js` | `editor` | `react` |",
            "",
            "Read-only in four ways, not one:",
            "",
            "1. the content is not editable",
            "2. the cursor is hidden, so it does not invite one",
            "3. the active-line highlight is off, for the same reason",
            "4. the syntax worker is never started",
            "",
            "> Nothing here is a place to write code, and it should not look",
            "> like one for even a moment."
        ].join('\n')
    }
};

//THE SAME WORDS, TWICE. Left as prose, right as JavaScript. Every highlighted
//word on the right is a keyword that happens to be an English one, and none of
//them mean anything here.
var PROSE = [
    "A judge may not delete what it did not create, and may not do so on",
    "behalf of another. Where a class of work is in dispute, the judge is to",
    "read every line of it in turn, and is to record what it found and why.",
    "Nothing in this section extends to work that has already been approved."
].join('\n');

//A REAL CHANGE, NOT A MADE-UP ONE. This is the markdown frame learning to
//measure its own document, which is a change somebody would actually have to
//read: three lines added, one line rewritten, and nothing about it obvious from
//a list of file names.
var BEFORE = [
    "return <iframe className=\"md\" srcDoc={doc} style={{",
    "    width: '100%', border: 0, display: 'block',",
    "    height: height || '60vh'",
    "}} />;"
].join('\n');

var AFTER = [
    "return <iframe className=\"md\" ref={frame} srcDoc={doc}",
    "    onLoad={function () { if (fit) setTall(measure(frame.current)); }}",
    "    style={{",
    "        width: '100%', border: 0, display: 'block',",
    "        height: fit && tall ? Math.max(tall, height || 0) : (height || '60vh')",
    "    }} />;"
].join('\n');

//AND A CHANGE THAT IS NOT SETTLED YET, for the half that can be edited. Two
//manifests that disagree about three things, none of which a merge tool can
//decide for anybody.
var OURS = [
    "{",
    "    \"name\": \"rectify-webpack-react-nw-app\",",
    "    \"app\": {",
    "        \"serve\": false,",
    "        \"canServe\": true",
    "    },",
    "    \"chromium-args\": \"--mixed-context\"",
    "}"
].join('\n');

var THEIRS = [
    "{",
    "    \"name\": \"rectify-webpack-react-nw-app\",",
    "    \"app\": {",
    "        \"serve\": true,",
    "        \"canServe\": false",
    "    },",
    "    \"chromium-args\": \"--mixed-context --disable-raf-throttling\"",
    "}"
].join('\n');

module.exports = function EditorPage(props) {
    var { theme, editor } = props;
    var { Section, Panel, Columns, Button, ButtonGroup, Alert, Icon, Badge } = theme.ui;
    var { Code, Diff, LID } = editor;

    var [which, setWhich] = useState('javascript');
    var sample = SAMPLES[which];

    //the right-hand side of the merge is state, because it is the one thing on
    //this page somebody can change
    var [right, setRight] = useState(THEIRS);
    var [count, setCount] = useState(0);
    var settled = right === OURS;

    //THE PAGE PICKS THE PALETTE, NOT THE PLUGIN -- see the Terminal page for the
    //full reasoning. `theme.showing` and not `theme.mode`: a dark-only swatch
    //asked for light stays dark, and a white pane in it would be a hole cut in
    //the window.
    var [mode, setMode] = useState(theme.showing);
    useEffect(function () { return theme.onModeChange(function () { setMode(theme.showing); }); }, []);

    var look = editor.look(mode);

    return (
        <>
            <Section title="Editor" lead="text that has to be read closely, rather than scrolled past"
                aside={
                    <ButtonGroup>
                        {Object.keys(SAMPLES).map(function (key) {
                            return (
                                <Button key={key} size="sm"
                                    variant={which === key ? 'primary' : 'outline-secondary'}
                                    onClick={function () { setWhich(key); }}>
                                    {SAMPLES[key].label}
                                </Button>
                            );
                        })}
                    </ButtonGroup>
                }>

                <Alert variant="secondary" className="small">
                    <Icon name="file-earmark-code" /> Three modes are bundled &mdash; javascript,
                    markdown and diff &mdash; because those are the three this app actually reads.
                    Ace fetches its modes over the wire by default; here they are
                    <code> require</code>d, so a packaged build with no server still has them.
                </Alert>

                <Panel title={sample.label} lead={sample.hint}
                    aside={<Badge variant="secondary">ace/mode/{sample.mode}</Badge>}>
                    <Code text={sample.text} mode={sample.mode} look={look} />
                </Panel>
            </Section>

            <Section title="Why the default is plain text"
                lead="the same four sentences, highlighted two ways">
                <Columns of={2}>
                    <Panel title="text" lead="what it is" aside={<Badge variant="success">default</Badge>}>
                        <Code text={PROSE} look={look} />
                    </Panel>
                    <Panel title="javascript" lead="what a guess would make of it"
                        aside={<Badge variant="danger">false emphasis</Badge>}>
                        <Code text={PROSE} mode="javascript" look={look} />
                    </Panel>
                </Columns>
                <p className="text-body-secondary small mt-3 mb-0">
                    <Icon name="exclamation-triangle" /> On the right, <code>delete</code>,
                    <code> do</code>, <code>in</code> and <code>class</code> are coloured because
                    they are JavaScript keywords. This is a document about what a judge may
                    <em> not</em> do, and the guess has emphasised the word <code>delete</code>.
                </p>
            </Section>

            <Section title="Judging a change" lead="the same file, before and after">
                <Alert variant="secondary" className="small">
                    <Icon name="git" /> Read-only on both sides, scroll locked together, with a
                    gutter drawing what moved where. Nothing here can be edited: what is being
                    judged is the change <em>from</em> the left, so a left that could be edited
                    would be a diff that can be made to say anything.
                </Alert>

                <Panel title="ui/markdown/window.js" lead="the frame learning to fit its document"
                    aside={<Badge variant="secondary">read-only</Badge>}>
                    <Diff left={BEFORE} right={AFTER} mode="javascript" height={300} look={look} />
                </Panel>
            </Section>

            <Section title="Resolving one" lead="the same geometry, with the right side unlocked"
                aside={<Badge variant={settled ? 'success' : 'warning'}>
                    {settled ? 'settled' : count + ' to go'}
                </Badge>}>

                <Alert variant="secondary" className="small">
                    <Icon name="arrow-left-right" /> The arrows in the gutter copy a line across.
                    The right side takes typing as well &mdash; everything under it is what the
                    editor says <em>now</em>, reported as it changes rather than read back when
                    somebody asks.
                </Alert>

                <Panel title="a manifest, two ways" lead="click an arrow, or type in the right pane"
                    aside={
                        <Button size="sm" variant="outline-secondary"
                            onClick={function () { setRight(THEIRS); }}>
                            <Icon name="arrow-counterclockwise" /> Start again
                        </Button>
                    }>
                    <Diff left={OURS} right={right} mode="javascript" height={260} editable
                        look={look}
                        onChange={setRight}
                        onDiffReady={function (diffs) { setCount(diffs.length); }} />
                </Panel>

                <Columns of={2}>
                    <Panel title="what the right side says now" lead="straight out of onChange">
                        <Code text={right} mode="javascript" look={look} />
                    </Panel>
                    <Panel title="how far there is to go" lead="straight out of onDiffReady">
                        <p className="small mb-0">
                            {settled
                                ? 'The two sides are identical, so there is nothing left to resolve.'
                                : count + ' difference' + (count === 1 ? '' : 's')
                                + ' remain. Every arrow clicked is one fewer, and the count comes'
                                + ' from the library rather than from counting lines here.'}
                        </p>
                    </Panel>
                </Columns>
            </Section>

            <Section title="The lid" lead="a long thing, capped">
                <Panel title={'maxLines ' + LID}
                    lead="with a lid, ace lays out only what fits; without one it lays out every row">
                    <Code tall look={look} text={new Array(120).join('')
                        + Array.from({ length: 60 }, function (_, i) {
                            return 'line ' + (i + 1) + '  ' + new Array((i % 9) + 2).join('the quick brown fox ');
                        }).join('\n')} />
                </Panel>
                <p className="text-body-secondary small mt-3 mb-0">
                    <Icon name="info-circle" /> Ace measures its own laid-out rows <em>after</em>
                    {' '}wrapping and sizes the box to them. Counting newlines here would be wrong
                    twice over: too short, because a long thing hits a clamp and gets a scrollbar
                    inside a page that already scrolls; and too tall, because wrapping turns one
                    long line into three screen rows. <code>Editor</code> is exported too, for
                    anything these two components will not do.
                </p>
            </Section>
        </>
    );
};
