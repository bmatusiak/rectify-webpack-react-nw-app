var React = require('react');
var { useState, useEffect } = React;

//MARKDOWN, RENDERED WHERE IT CANNOT DO ANYTHING.
//
//Markdown carries raw HTML through BY DESIGN, and `marked` does not sanitise it
//and has never claimed to. In this document that HTML would be running inside a
//page that has node behind it. So the plugin next door renders into a frame
//with its own Content-Security-Policy, and the policy is the whole design
//rather than a convenience for styling.
//
//AND IT IS ASSERTED HERE RATHER THAN ASSUMED THERE. The document below contains
//a real <script> and a real onerror, each with the text they would overwrite
//written beside them. If the policy ever stops holding, this page says so on
//sight — which is worth more than a comment in the plugin claiming it still
//does.

var LT = String.fromCharCode(60);

var DOC = [
    '# A pull request body',
    '',
    'This is markdown that GitHub would render, so a preview of it that is *not*',
    'rendered is a preview of the wrong thing.',
    '',
    '## What changed',
    '',
    '| file | what |',
    '|---|---|',
    '| `webpack.config.js` | two kinds of `.css`, and they must not share a rule |',
    '| `ui/litegraph/window.js` | a new plugin, wrapping a vendored renderer |',
    '| `demo/pages/graph.js` | this app’s own dependency graph, drawn |',
    '',
    '## Why',
    '',
    '> Every `.css` was being named for the swatch folder it came from, and one',
    '> that came from no swatch folder was named `swatch-default.css`. The second',
    '> such file broke the build outright.',
    '',
    'The fix splits the rule by where the file lives:',
    '',
    '```js',
    'const stylesheets  = { test: /\\.css$/i, include: swatchSources, type: "asset/resource" };',
    'const pluginStyles = { test: /\\.css$/i, exclude: swatchSources, use: ["style-loader", "css-loader"] };',
    '```',
    '',
    '- [x] the build is green',
    '- [x] `xterm.css` is injected rather than emitted',
    '- [ ] the packaged build has not been measured again yet',
    '',
    '---',
    '',
    '## The part that is a test',
    '',
    'Two pieces of live HTML follow. Both are legal markdown, both are passed',
    'through untouched by `marked`, and **neither should do anything**.',
    '',
    '### 1. A script tag',
    '',
    'The line under this one should read *the script did not run*.',
    '',
    LT + 'p id="one">the script did not run' + LT + '/p>',
    LT + 'script>document.getElementById("one").textContent = "THE SCRIPT RAN";' + LT + '/script>',
    '',
    '### 2. An inline handler',
    '',
    'The line under this one should read *the handler did not run*.',
    '',
    LT + 'p id="two">the handler did not run' + LT + '/p>',
    LT + 'img src="x" onerror=\'document.getElementById("two").textContent = "THE HANDLER RAN"\'>',
    '',
    '### 3. A remote image',
    '',
    'There should be no request to any host. The policy is `img-src data:`, so',
    'even a broken image cannot turn *somebody opened this* into a request to a',
    'host of the author’s choosing.',
    '',
    LT + 'img src="https://example.invalid/pixel.png" width="1" height="1">',
    ''
].join('\n');

module.exports = function MarkdownPage(props) {
    var { theme, markdown, editor } = props;
    var { Section, Panel, Columns, Button, ButtonGroup, Alert, Icon, Badge } = theme.ui;
    var Frame = markdown.Frame;
    var Code = editor.Code;

    var [view, setView] = useState('rendered');

    //THE PAGE PICKS THE PALETTE, NOT THE PLUGIN -- see the Terminal page for the
    //full reasoning. `theme.showing` and not `theme.mode`: a dark-only swatch
    //asked for light stays dark, and a white surface in it would be a hole cut
    //in the window.
    var [mode, setMode] = useState(theme.showing);
    useEffect(function () { return theme.onModeChange(function () { setMode(theme.showing); }); }, []);

    var look = markdown.look(mode);

    return (
        <>
            <Section title="Markdown" lead="rendered where it cannot do anything"
                aside={
                    <ButtonGroup>
                        <Button size="sm" variant={view === 'rendered' ? 'primary' : 'outline-secondary'}
                            onClick={function () { setView('rendered'); }}>
                            <Icon name="eye" /> Rendered
                        </Button>
                        <Button size="sm" variant={view === 'source' ? 'primary' : 'outline-secondary'}
                            onClick={function () { setView('source'); }}>
                            <Icon name="code" /> Source
                        </Button>
                    </ButtonGroup>
                }>

                <Alert variant="secondary" className="small">
                    <Icon name="shield-check" /> The frame carries
                    <code> default-src &apos;none&apos;</code>, which every fetch directive falls
                    back to &mdash; <code>script-src</code> included. A
                    <code> &lt;script&gt;</code> has no source it is allowed to execute from, and
                    an inline <code>onerror</code> would need
                    <code> script-src &apos;unsafe-inline&apos;</code>, which is not granted either.
                </Alert>

                {view === 'rendered'
                    ? <Frame text={DOC} height={320} fit look={look} />
                    : <Code tall text={DOC} mode="markdown" />}
            </Section>

            <Section title="What you should be seeing" lead="the exhibit, in words">
                <Columns of={3}>
                    <Panel title="the script tag" aside={<Badge variant="success">inert</Badge>}>
                        <p className="small mb-0">
                            Should read <em>the script did not run</em>. If it says
                            <strong> THE SCRIPT RAN</strong>, the policy stopped holding and this
                            page is the bug report.
                        </p>
                    </Panel>
                    <Panel title="the inline handler" aside={<Badge variant="success">inert</Badge>}>
                        <p className="small mb-0">
                            Should read <em>the handler did not run</em>. An
                            <code> onerror</code> on a broken image is the shortest path from
                            &ldquo;markdown&rdquo; to &ldquo;arbitrary code&rdquo;, which is why it
                            is in here.
                        </p>
                    </Panel>
                    <Panel title="the remote image" aside={<Badge variant="warning">blocked</Badge>}>
                        <p className="small mb-0">
                            Nothing should reach <code>example.invalid</code>. Open devtools and
                            watch the network tab if you want to see it refused rather than take
                            this panel&rsquo;s word for it.
                        </p>
                    </Panel>
                </Columns>
            </Section>

            <Section title="Why there is no sandbox attribute" lead="measured, not assumed">
                <p className="text-body-secondary small mb-0">
                    <Icon name="info-circle" /> <code>sandbox=&quot;&quot;</code> renders
                    <strong> nothing</strong> in this nw.js build, silently &mdash; an empty box the
                    size you asked for, which reads as &ldquo;there was nothing to show&rdquo;. It
                    was measured five ways: plain <code>srcdoc</code> renders; adding
                    <code> sandbox=&quot;&quot;</code> blanks it; adding the CSP as well blanks it;
                    a <code>data:</code> URL instead blanks it; only
                    <code> sandbox=&quot;allow-same-origin&quot;</code> rendered. So the choice was
                    never &ldquo;sandbox or not&rdquo; &mdash; it was which single restriction to
                    keep, and the CSP is the one that holds by itself.
                </p>
            </Section>
        </>
    );
};
