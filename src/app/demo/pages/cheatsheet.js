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

            <Section title="Icons" lead="bootstrap-icons, one sprite, injected once"
                aside={<Button size="sm" outline variant="secondary"
                    onClick={function () { toast('one document, and every use resolves against it', 'secondary'); }}>
                    Where from?
                </Button>}>
                <div className="d-flex flex-wrap gap-3">
                    {['box-seam', 'cpu', 'ui-radios', 'input-cursor-text', 'table', 'window-stack',
                        'chevron-expand', 'columns-gap', 'speedometer2', 'bag-check', 'file-text',
                        'rocket-takeoff', 'plug', 'shield-lock', 'diagram-3', 'palette'].map(function (name) {
                        return (
                            <span key={name} className="d-inline-flex flex-column align-items-center gap-1"
                                style={{ width: '5rem' }}>
                                <Icon name={name} size="24" />
                                <small className="text-body-secondary text-truncate w-100 text-center">{name}</small>
                            </span>
                        );
                    })}
                </div>
            </Section>
        </>
    );
};
