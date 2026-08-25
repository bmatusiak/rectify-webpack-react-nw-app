var React = require('react');
var { useState, useEffect } = React;

//---------------------------------------------------------------------------
//A PAGE, FROM A TREE THE APP HAS NEVER HEARD OF.
//
//This is what ../../app/core/pages was built for, and it is the proof rather
//than the point: nothing in src/app knows this exists, nothing was edited to
//make room for it, and deleting src/app_plugins takes it away without leaving a
//gap. It registers a page the same way the demo registers its own, and lands in
//the same sidebar.
//
//WHY IT IS ITS OWN PLUGIN AND NOT PART OF ../tts. A page is a composition of the
//theme kit, so it has to consume `theme` -- and ../tts must not, or a scaffold
//with the theme deleted would lose the ability to SPEAK because it lost the
//ability to draw. Splitting them keeps the service usable from a headless build
//and from the terminal, which is most of why that service has a node half at
//all. Same cut as ../mcp and ../mcp-example: the capability, and the thing that
//shows it off.
//
//AND IT IS WHERE THE CLICK COMES FROM. Chromium will not speak in a page nobody
//has touched -- the autoplay policy, since speech is audio -- so ../tts falls
//back to the node half and says why. Pressing Speak on this page IS the user
//activation, which is the only way to make the in-page route work at all, and
//the route line below says which one answered so the difference is visible
//rather than folklore.
//---------------------------------------------------------------------------

plugin.consumes = ['pages', 'theme', 'tts', 'Plugin'];
plugin.provides = [];
async function plugin(imports, register) {
    var { pages, theme, tts } = imports;
    var self = new imports.Plugin('tts-page');

    var { Button, Icon, Alert, Badge } = theme.ui;
    var { Textarea, Select, Range } = theme.ui;
    var { Section } = theme.ui;

    var SAMPLE = 'The app can speak. This sentence is long enough to be read in one ' +
        'piece, and the one after it is not. Adding more text than a single utterance ' +
        'will carry is what makes the chunking visible.';

    function Speech({ toast }) {
        var [text, setText] = useState(SAMPLE);
        var [voices, setVoices] = useState([]);
        var [voice, setVoice] = useState('');
        var [rate, setRate] = useState(1);
        var [volume, setVolume] = useState(1);
        var [busy, setBusy] = useState(false);
        var [said, setSaid] = useState(null);
        var [failed, setFailed] = useState(null);

        //the list arrives late in every chromium build -- ../tts waits for it, so
        //this only has to wait for ../tts
        useEffect(function () {
            var gone = false;
            tts.voices().then(function (list) { if (!gone) setVoices(list); });
            return function () { gone = true; };
        }, []);

        async function speak(via) {
            setFailed(null);
            setBusy(true);

            try {
                var out = await tts.speak(text, {
                    via: via, voice: voice || undefined,
                    rate: Number(rate), volume: Number(volume)
                });

                setSaid(out);
                if (toast && out.route === 'node' && out.why === 'not-allowed') {
                    toast('The page was not allowed to speak, so the node half did', { variant: 'info' });
                }
            } catch (e) {
                setFailed((e && e.message) || String(e));
            } finally {
                setBusy(false);
            }
        }

        return (
            <>
                <Section title="Say something"
                    lead="The same service, answered by whichever half of the app can.">

                    <Textarea id="tts-text" rows={4} value={text}
                        label="Text"
                        hint={'chunked at sentence boundaries -- chromium truncates a long utterance and tells nobody'}
                        onChange={function (e) { setText(e.target.value); }} />

                    <div className="row g-3 mt-1">
                        <div className="col-sm-6">
                            <Select id="tts-voice" label="Voice" value={voice}
                                onChange={function (e) { setVoice(e.target.value); }}
                                options={[{ value: '', label: voices.length ? 'default' : 'none installed' }]
                                    .concat(voices.map(function (v) {
                                        return { value: v.name, label: v.name + ' (' + v.lang + ')' };
                                    }))} />
                        </div>
                        <div className="col-sm-3">
                            <Range id="tts-rate" label={'Rate ' + Number(rate).toFixed(1)}
                                min={0.5} max={2} step={0.1} value={rate}
                                onChange={function (e) { setRate(e.target.value); }} />
                        </div>
                        <div className="col-sm-3">
                            <Range id="tts-volume" label={'Volume ' + Number(volume).toFixed(1)}
                                min={0} max={1} step={0.1} value={volume}
                                onChange={function (e) { setVolume(e.target.value); }} />
                        </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2 mt-3">
                        <Button variant="primary" icon="megaphone" disabled={busy}
                            onClick={function () { speak(); }}>
                            {busy ? 'Speaking' : 'Speak'}
                        </Button>

                        {/* THE TWO ROUTES, ASKED FOR BY NAME. On a machine with
                            voices the page never falls back, so the half that
                            matters on a bare linux box would be the half nobody
                            ever ran. */}
                        <Button outline variant="secondary" icon="window" disabled={busy}
                            onClick={function () { speak('speech'); }}>In the page</Button>

                        <Button outline variant="secondary" icon="hdd-network" disabled={busy}
                            onClick={function () { speak('node'); }}>In the node half</Button>

                        <Button outline variant="danger" icon="stop-circle"
                            onClick={function () { tts.stop(); setBusy(false); }}>Stop</Button>
                    </div>
                </Section>

                <Section title="What answered">
                    {failed ? (
                        <Alert variant="danger" className="d-flex align-items-center gap-2">
                            <Icon name="exclamation-triangle" />
                            <span>{failed}</span>
                        </Alert>
                    ) : null}

                    {said ? (
                        <p className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                            <Badge variant={said.route === 'speech' ? 'primary' : 'secondary'}>
                                {said.route === 'speech' ? 'the page' : 'the node half'}
                            </Badge>
                            <span className="text-body-secondary">
                                {said.parts} {said.parts === 1 ? 'part' : 'parts'}
                                {said.stopped ? ', stopped early' : ''}
                                {said.why === 'not-allowed'
                                    ? ' -- the page was refused, because nothing had been clicked yet'
                                    : ''}
                            </span>
                        </p>
                    ) : <p className="text-body-secondary mb-2">Nothing yet.</p>}

                    <p className="text-body-secondary small mb-0">
                        {voices.length
                            ? voices.length + ' voices, from the operating system rather than from chromium'
                            : 'No voices in this window -- speaking goes to the node half over the socket.'}
                    </p>
                </Section>
            </>
        );
    }

    //ADDED, NOT LISTED ANYWHERE. `remove` is owned so a reload of this half takes
    //the page with it rather than leaving one behind that renders a component
    //from a build that no longer exists.
    var added = pages.add({
        id: 'speech',
        label: 'Speech',
        icon: 'megaphone',
        Page: Speech
    });

    self.own(added.remove);

    await register(null, { onDestroy: self.unload });
}
module.exports = plugin;
