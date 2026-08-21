var React = require('react');
var { useState } = React;

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

module.exports = function EditorPage(props) {
    var { theme, editor } = props;
    var { Section, Panel, Columns, Button, ButtonGroup, Alert, Icon, Badge } = theme.ui;
    var { Code, Editor, LID } = editor;

    var [which, setWhich] = useState('javascript');
    var sample = SAMPLES[which];

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
                    <Code text={sample.text} mode={sample.mode} />
                </Panel>
            </Section>

            <Section title="Why the default is plain text"
                lead="the same four sentences, highlighted two ways">
                <Columns of={2}>
                    <Panel title="text" lead="what it is" aside={<Badge variant="success">default</Badge>}>
                        <Code text={PROSE} />
                    </Panel>
                    <Panel title="javascript" lead="what a guess would make of it"
                        aside={<Badge variant="danger">false emphasis</Badge>}>
                        <Code text={PROSE} mode="javascript" />
                    </Panel>
                </Columns>
                <p className="text-body-secondary small mt-3 mb-0">
                    <Icon name="exclamation-triangle" /> On the right, <code>delete</code>,
                    <code> do</code>, <code>in</code> and <code>class</code> are coloured because
                    they are JavaScript keywords. This is a document about what a judge may
                    <em> not</em> do, and the guess has emphasised the word <code>delete</code>.
                </p>
            </Section>

            <Section title="The lid" lead="a long thing, capped">
                <Panel title={'maxLines ' + LID}
                    lead="with a lid, ace lays out only what fits; without one it lays out every row">
                    <Code tall text={new Array(120).join('')
                        + Array.from({ length: 60 }, function (_, i) {
                            return 'line ' + (i + 1) + '  ' + new Array((i % 9) + 2).join('the quick brown fox ');
                        }).join('\n')} />
                </Panel>
                <p className="text-body-secondary small mt-3 mb-0">
                    <Icon name="info-circle" /> Ace measures its own laid-out rows <em>after</em>
                    {' '}wrapping and sizes the box to them. Counting newlines here would be wrong
                    twice over: too short, because a long thing hits a clamp and gets a scrollbar
                    inside a page that already scrolls; and too tall, because wrapping turns one
                    long line into three screen rows. <code>Editor</code> is exported too, for the
                    side-by-side diff that will need to scroll two of them together.
                </p>
            </Section>
        </>
    );
};
