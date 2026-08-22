var React = require('react');
var { useState, useEffect } = React;

//bootstrap's cheatsheet is every component on one page. This app already spends
//six pages on the components, so this one is the other half of that reference:
//the values underneath them -- the colours, the type scale, the edges.
//
//and it reads them off the live page rather than listing them, so it says what
//the swatch you are wearing actually resolved to, not what bootstrap ships.

var COLOURS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
var TYPE = ['display-1', 'display-4', 'h1', 'h3', 'h5', 'lead', 'small'];

function read(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

module.exports = function Cheatsheet(props) {
    var { theme, toast } = props;
    var { Section, Panel, Columns, Table, Button, Icon } = theme.ui;

    var [values, setValues] = useState({});

    //ALL OF THEM, WHICH IS TWO THOUSAND -- so a filter is not a nicety here.
    //The sprite is one document injected once, so showing every icon costs no
    //fetch and no parse; what it costs is dom, and the reason this renders the
    //filtered list rather than hiding the rest with css is that `display: none`
    //still leaves two thousand <svg><use> in the tree to lay out.
    var [hunt, setHunt] = useState('');

    var showing = hunt
        ? theme.icons.filter(function (name) { return name.indexOf(hunt.toLowerCase().trim()) >= 0; })
        : theme.icons;

    //A CHEATSHEET IS SOMETHING YOU COPY FROM. The name alone is the thing that
    //is hard to remember, but the markup is what actually gets pasted.
    function copy(name) {
        var markup = '<Icon name="' + name + '" />';

        //clipboard access can be refused, and a toast that says it copied when
        //it did not is worse than one that says it could not
        Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(markup))
            .then(function () { toast(markup + ' copied', 'success', 'clipboard-check'); },
                function () { toast('could not reach the clipboard -- the name is ' + name, 'warning'); });
    }

    //re-read whenever the swatch or the mode moves under us
    useEffect(function () {
        function sample() {
            var out = {};
            COLOURS.forEach(function (name) {
                out[name] = read('--bs-' + name);
                out[name + '-subtle'] = read('--bs-' + name + '-bg-subtle');
                out[name + '-emphasis'] = read('--bs-' + name + '-text-emphasis');
            });
            out.border = read('--bs-border-color');
            out.radius = read('--bs-border-radius');
            out.font = read('--bs-body-font-family').split(',')[0];
            setValues(out);
        }

        sample();
        return theme.onModeChange(sample);
    }, [theme.swatch]);

    return (
        <>
            <Section title="Colours" lead={'what ' + theme.swatch + ' resolved to, read off this page'}>
                <Table head={['', 'Name', 'Value', 'Subtle', 'Emphasis']}>
                    {COLOURS.map(function (name) {
                        return (
                            <tr key={name}>
                                <td style={{ width: '3rem' }}>
                                    <span className="d-inline-block rounded"
                                        style={{
                                            width: '2rem', height: '1.4rem',
                                            background: 'var(--bs-' + name + ')',
                                            border: '1px solid var(--bs-border-color)'
                                        }} />
                                </td>
                                <td className="fw-semibold">{name}</td>
                                <td><code>{values[name] || '-'}</code></td>
                                <td>
                                    <span className={'badge text-' + name + '-emphasis bg-' + name + '-subtle border border-' + name + '-subtle'}>
                                        {values[name + '-subtle'] || '-'}
                                    </span>
                                </td>
                                <td className={'text-' + name + '-emphasis'}>
                                    {values[name + '-emphasis'] || '-'}
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Section>

            <Section title="Type" lead={'the scale, set in ' + (values.font || 'whatever the swatch asked for')}>
                {TYPE.map(function (name) {
                    return (
                        <div key={name} className="d-flex align-items-baseline gap-3 border-bottom py-2">
                            <code className="text-body-secondary" style={{ minWidth: '6rem' }}>{name}</code>
                            <span className={name}>The quick brown fox</span>
                        </div>
                    );
                })}
                <div className="mt-3">
                    <p className="mb-1">
                        Inline: <code>code</code>, <kbd>Ctrl</kbd> + <kbd>C</kbd>, <mark>marked</mark>,{' '}
                        <small className="text-body-secondary">small</small>, <abbr title="and so on">abbr</abbr>.
                    </p>
                    <blockquote className="blockquote border-start ps-3 mb-0">
                        <p className="mb-0 fs-6">A blockquote, which the swatch is free to restyle entirely.</p>
                    </blockquote>
                </div>
            </Section>

            <Section title="Edges" lead="borders, corners and shadow, as this swatch sets them">
              <Columns of={3}>
                <Panel title="Corners" lead={'--bs-border-radius is ' + (values.radius || '?')}>
                    <div className="d-flex flex-wrap gap-2">
                        {['rounded-0', 'rounded-1', 'rounded', 'rounded-3', 'rounded-pill', 'rounded-circle'].map(function (r) {
                            return (
                                <span key={r} className={'d-inline-flex align-items-center justify-content-center bg-body-tertiary border ' + r}
                                    style={{ width: '3.2rem', height: '3.2rem', fontSize: '.65rem' }}>
                                    {r.replace('rounded-', '') || 'base'}
                                </span>
                            );
                        })}
                    </div>
                </Panel>

                <Panel title="Shadow">
                    <div className="d-flex flex-wrap gap-3">
                        {['shadow-none', 'shadow-sm', 'shadow', 'shadow-lg'].map(function (sh) {
                            return (
                                <span key={sh} className={'d-inline-flex align-items-center justify-content-center bg-body rounded p-2 ' + sh}
                                    style={{ width: '4.5rem', height: '3rem', fontSize: '.65rem' }}>
                                    {sh.replace('shadow-', '') || 'base'}
                                </span>
                            );
                        })}
                    </div>
                </Panel>

                <Panel title="Borders" lead={'--bs-border-color is ' + (values.border || '?')}>
                    <div className="d-flex flex-wrap gap-2">
                        {['border', 'border-2', 'border-primary', 'border-danger', 'border-start', 'border-0'].map(function (b) {
                            return (
                                <span key={b} className={'d-inline-flex align-items-center justify-content-center bg-body-tertiary ' + b}
                                    style={{ width: '4.5rem', height: '3rem', fontSize: '.65rem' }}>
                                    {b}
                                </span>
                            );
                        })}
                    </div>
                </Panel>
              </Columns>
            </Section>

            <Section title="Icons" lead={theme.icons.length + ' of them, one sprite, injected once'}
                aside={
                    <input type="search" className="form-control form-control-sm"
                        style={{ width: '14rem' }}
                        placeholder={'filter ' + theme.icons.length + ' icons'}
                        value={hunt}
                        onChange={function (e) { setHunt(e.target.value); }} />
                }>

                <p className="text-body-secondary small">
                    <Icon name="info-circle" /> Every name here is read out of the sprite itself,
                    so this is what <code>&lt;Icon&gt;</code> will answer to rather than a list
                    somebody kept up to date. Click one to copy its markup.
                    {hunt ? <> Showing <strong>{showing.length}</strong> of {theme.icons.length}.</> : null}
                </p>

                {showing.length ? (
                    <div className="d-flex flex-wrap gap-3">
                        {showing.map(function (name) {
                            //WIDE ENOUGH FOR THE NAME, which is the point of the grid: at
                            //5rem with truncation ten neighbours all read `arrow-do...`, so
                            //the icons were distinguishable and the names -- the thing you
                            //came here for -- were not.
                            return (
                                <button key={name} type="button"
                                    className="btn btn-link text-decoration-none d-inline-flex flex-column align-items-center gap-1 p-1"
                                    style={{ width: '7rem' }}
                                    title={name}
                                    onClick={function () { copy(name); }}>
                                    <Icon name={name} size="24" />
                                    <small className="text-body-secondary w-100 text-center lh-sm"
                                        style={{ wordBreak: 'break-word', fontSize: '.7rem' }}>{name}</small>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mb-0">
                        Nothing matches <code>{hunt}</code>.
                    </p>
                )}
            </Section>
        </>
    );
};
