var React = require('react');
var { useState, useRef, useEffect } = React;

//WHY A TERMINAL AND NOT A <pre>, SHOWN RATHER THAN ASSERTED.
//
//What comes back from a machine is not text, it is drawing instructions: move
//the cursor, repaint this line, clear to the end, colour that word. A <pre>
//renders those as garbage in the middle of the output somebody is trying to
//read. So this page puts the SAME BYTES through both and lets you look.
//
//THE TRANSCRIPT IS CANNED, AND IT SAYS SO. Everything else in this demo is live
//because a mock would prove nothing; here the bytes ARE the subject, and a
//transcript that is the same every time is what makes the comparison a
//comparison. The escape sequences in it are real, and so is what xterm does
//with them.
//
//THE LOG PANEL IS LIVE. That half is real machine output: the launcher runs nw
//detached with its output going to nw.log, and this reads it over the socket.

var ESC = String.fromCharCode(27);
var CR = String.fromCharCode(13);
var NL = String.fromCharCode(10);
var CRLF = CR + NL;

function colour(code, text) { return ESC + '[' + code + 'm' + text + ESC + '[0m'; }

var GREEN = '32', RED = '31', YELLOW = '33', BLUE = '36', GREY = '90', BOLD = '1';

//A REAL SEQUENCE OF REAL ESCAPES: colour, a progress line rewritten in place
//with a carriage return, a cursor moved up to correct a line already printed,
//and a line cleared to the end. Every one of these is something a build tool,
//an installer or an ssh session actually does.
function transcript() {
    var out = [];

    out.push(colour(GREY, '$ ') + 'npm run build' + CRLF);
    out.push(colour(BOLD, 'webpack') + ' ' + colour(GREY, '5.109.2') + CRLF);
    out.push(CRLF);

    //a progress line that rewrites itself: \r returns to column 0
    for (var i = 0; i <= 100; i += 20) {
        var full = Math.round(i / 5);
        var bar = new Array(full + 1).join('#') + new Array(21 - full).join('.');
        out.push(CR + '  ' + colour(BLUE, bar) + ' ' + String(i).padStart(3) + '%');
    }
    out.push(CRLF);

    out.push('  ' + colour(GREEN, 'ok') + '   window.js   ' + colour(GREY, '2.1 mb') + CRLF);
    out.push('  ' + colour(GREEN, 'ok') + '   server.js   ' + colour(GREY, '412 kb') + CRLF);
    out.push('  ' + colour(YELLOW, 'warn') + ' main.bin    ' + colour(GREY, 'not compiled yet') + CRLF);

    //THE CURSOR GOES BACK UP AND FIXES A LINE ALREADY PRINTED. \x1b[1A is up one
    //row, \x1b[2K clears it, \r returns to the start. This is the one a <pre>
    //cannot fake even badly: the correction is not appended, it REPLACES.
    out.push(ESC + '[1A' + ESC + '[2K' + CR);
    out.push('  ' + colour(GREEN, 'ok') + '   main.bin    ' + colour(GREY, '4.0 mb') + CRLF);

    out.push(CRLF);
    out.push(colour(RED, 'ERR') + '  one swatch could not be read' + CRLF);
    out.push(colour(GREY, '     at tools/build.js:117') + CRLF);
    out.push(CRLF);
    out.push(colour(GREY, '$ ') + CRLF);

    return out.join('');
}

module.exports = function TerminalPage(props) {
    var { theme, io, xterm } = props;
    var { Section, Panel, Columns, Button, ButtonGroup, Alert, Icon, Badge } = theme.ui;
    var Term = xterm.Term;

    var term = useRef(null);
    var logTerm = useRef(null);

    var [bytes, setBytes] = useState('');
    var [log, setLog] = useState(null);

    //WRITTEN THROUGH A REF, NOT PASSED AS A PROP, which is the shape the xterm
    //plugin asks for: output is appended, and a `text` prop would re-render the
    //terminal on every chunk and throw away the scrollback being read.
    function run() {
        var text = transcript();
        setBytes(text);
        if (term.current) { term.current.clear(); term.current.write(text); }
    }

    useEffect(function () { run(); }, []);

    function loadLog() {
        io.emit('demo:log', { count: 300 }, function (answer) {
            setLog(answer || null);
            if (!logTerm.current) return;
            logTerm.current.clear();
            if (!answer || answer.missing) {
                logTerm.current.write(colour(YELLOW, 'no nw.log') + CRLF +
                    colour(GREY, (answer && answer.file) || '') + CRLF + CRLF +
                    'A packaged app has no launcher writing one.' + CRLF);
                return;
            }
            logTerm.current.write(answer.lines.join(CRLF) + CRLF);
        });
    }

    useEffect(function () { loadLog(); }, []);

    return (
        <>
            <Section title="Terminal" lead="bytes that arrived from somewhere else"
                aside={<Button size="sm" variant="outline-secondary" onClick={run}>
                    <Icon name="arrow-clockwise" /> play it again
                </Button>}>

                <Alert variant="secondary" className="small">
                    <Icon name="terminal" /> The two panels below are the <strong>same bytes</strong>.
                    One is <code>xterm.js</code>, which reads the escape sequences; the other is
                    a <code>&lt;pre&gt;</code>, which does not. Watch the progress bar, and watch
                    the <code>warn main.bin</code> line get corrected in place.
                </Alert>

                <Columns of={2}>
                    <Panel title="xterm" lead="the escapes are instructions"
                        aside={<Badge variant="success">interpreted</Badge>}>
                        <Term ref={term} height={300} />
                    </Panel>

                    <Panel title="&lt;pre&gt;" lead="the escapes are characters"
                        aside={<Badge variant="danger">literal</Badge>}>
                        <pre className="term-plain mb-0" style={{
                            height: 300, overflow: 'auto', margin: 0, padding: '8px 10px',
                            background: '#0a0d12', color: '#c9d1d9', fontSize: 13,
                            fontFamily: 'Consolas, "Cascadia Mono", monospace'
                        }}>{bytes}</pre>
                    </Panel>
                </Columns>
            </Section>

            <Section title="The app's own log" lead="this one is live, and it is real machine output"
                aside={<ButtonGroup>
                    <Button size="sm" variant="outline-secondary" onClick={loadLog}>
                        <Icon name="arrow-clockwise" /> reload
                    </Button>
                </ButtonGroup>}>

                <Panel title={log && log.file ? log.file : 'nw.log'}
                    lead={log
                        ? (log.missing ? 'not there' : log.total + ' lines, showing the last ' + log.lines.length)
                        : 'reading…'}>
                    <Term ref={logTerm} height={280} />
                </Panel>

                <p className="text-body-secondary small mt-3 mb-0">
                    <Icon name="info-circle" /> No pty, and that is on purpose. A terminal usually
                    implies one, which on Windows means a compiled dependency matched to the Node
                    ABI nw.js was built against &mdash; exactly the kind of thing this project does
                    not have. This side only moves bytes; whatever produces them is somebody
                    else&rsquo;s plugin.
                </p>
            </Section>
        </>
    );
};
