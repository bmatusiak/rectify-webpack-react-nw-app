//the half that actually touches the page. Everything the terminal does to this
//app -- click, fill, read -- ends up here, and every check in tools/drive.js is
//downstream of it being right.
//
//it cannot be tested anywhere else. Finding an element by its visible text,
//preferring the one that is on screen, dispatching the sequence a mouse
//produces, defeating react's value tracker: all of it is about a document.

plugin.consumes = ['selftest', 'remote'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var remote = imports.remote;

    //straight at the verbs. Not over the socket: emitting on this window's
    //socket sends to the server, which is the opposite direction, and the
    //server sending it back would only be testing the round trip twice.
    function ask(verb, data) {
        return Promise.resolve().then(function () { return remote[verb](data); });
    }

    //somewhere to click that is not the app
    function scratch() {
        var box = document.createElement('div');
        box.id = 'probe-scratch';
        document.body.appendChild(box);
        return box;
    }

    function clear() {
        var box = document.getElementById('probe-scratch');
        if (box) box.remove();
    }

    describe('remote, in the page', function () {

        it('finds an element by css selector', async function () {
            var seen = await ask('read', { selector: '.navbar-brand' });
            assert.equal(seen.found, 'selector');
            assert.ok(seen.text.length > 0, 'it read nothing');
        });

        it('finds one by the words on it when the selector is not css', async function () {
            var seen = await ask('read', { selector: 'Forms' });
            assert.equal(seen.found, 'text');
        });

        it('clicks what a mouse would, not just what click() would', async function () {
            var box = scratch();
            var got = [];

            box.innerHTML = '<button id="probe-btn">Press me</button>';
            var button = box.querySelector('#probe-btn');

            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
                button.addEventListener(type, function () { got.push(type); });
            });

            try {
                await ask('click', { selector: '#probe-btn' });
                //half of bootstrap listens for the ones around the click --
                //dropdowns close on pointerdown, carousels drag on mousedown
                ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
                    assert.ok(got.indexOf(type) >= 0, 'no ' + type);
                });
            } finally { clear(); }
        });

        it('refuses a word that matches more than one thing', async function () {
            var box = scratch();
            box.innerHTML = '<button>Twice</button><button>Twice</button>';

            var complaint = null;
            try { await ask('click', { selector: 'Twice' }); }
            catch (e) { complaint = e.message; }
            finally { clear(); }

            assert.ok(complaint, 'it picked one');
            assert.ok(complaint.indexOf('matches 2') >= 0, complaint);
        });

        it('prefers something on screen to something hidden', async function () {
            var box = scratch();
            box.innerHTML = '<button style="display:none">Hidden one</button>' +
                '<button id="probe-visible">Hidden one</button>';

            try {
                var seen = await ask('read', { selector: 'Hidden one' });
                assert.equal(seen.element, 'button#probe-visible');
            } finally { clear(); }
        });

        it('fills an input so that a listener hears it', async function () {
            var box = scratch();
            var heard = [];

            box.innerHTML = '<input id="probe-input" type="text">';
            var input = box.querySelector('#probe-input');
            input.addEventListener('input', function () { heard.push('input'); });
            input.addEventListener('change', function () { heard.push('change'); });

            try {
                await ask('fill', { selector: '#probe-input', value: 'typed' });

                assert.equal(input.value, 'typed');
                //react tracks the last value it wrote and drops a change event
                //whose value it thinks it already knows, so both have to fire
                assert.ok(heard.indexOf('input') >= 0, 'no input event');
                assert.ok(heard.indexOf('change') >= 0, 'no change event');
            } finally { clear(); }
        });

        it('toggles a checkbox by clicking it, which is the path react hears', async function () {
            var box = scratch();
            box.innerHTML = '<input id="probe-check" type="checkbox">';
            var check = box.querySelector('#probe-check');

            try {
                await ask('fill', { selector: '#probe-check' });
                assert.equal(check.checked, true);

                await ask('fill', { selector: '#probe-check' });
                assert.equal(check.checked, false);
            } finally { clear(); }
        });

        it('says what a select can take when asked for something it cannot', async function () {
            var box = scratch();
            box.innerHTML = '<select id="probe-select"><option value="a">a</option></select>';

            var complaint = null;
            try { await ask('fill', { selector: '#probe-select', value: 'z' }); }
            catch (e) { complaint = e.message; }
            finally { clear(); }

            assert.ok(complaint && complaint.indexOf('it has: a') >= 0, complaint);
        });

        it('measures contrast against what is really behind the text', async function () {
            var box = scratch();
            //a three percent overlay is what a bootstrap card header is, and
            //reading it as the background measured white text at 1.3:1
            box.innerHTML = '<div style="background:#111"><div style="background:rgba(255,255,255,0.03)">' +
                '<span id="probe-text" style="color:#fff">readable</span></div></div>';

            try {
                var seen = await ask('read', { selector: '#probe-text' });
                assert.ok(seen.contrast, 'no contrast reported');
                assert.ok(seen.contrast.ratio > 15, 'measured ' + seen.contrast.ratio + ':1 on white over near-black');
                assert.equal(seen.contrast.readable, true);
            } finally { clear(); }
        });
    });

    register();
}
module.exports = plugin;
