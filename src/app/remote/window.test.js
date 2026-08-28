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

    //---- and what it will not touch ----------------------------------------
    //
    //THE GUARD AND THE STANCE ARE BOTH ENFORCED HERE, at the door the outside
    //comes through, and until now nothing was watching either. That is not a
    //small gap: ../core/may can be perfectly correct and this file is where it
    //is actually applied to a click.
    //
    //AN UNNAMED MARK IS THE CASE THESE USE, and it is chosen to be quiet. A
    //named guard raises a real dialog in this window and sits there for two
    //minutes -- which would wedge every suite after it, the exact failure the
    //30s per-test timeout in ../core/selftest/suites.js was added for. An
    //unnamed one is refused without asking anybody, so it exercises the mark,
    //the lookup and all three verbs with nothing left on screen.

    describe('a control the driver may not touch', function () {
        function guarded(withName) {
            var box = scratch();

            var button = document.createElement('button');
            button.id = 'probe-guarded';
            button.className = 'btn is-guarded';
            button.textContent = 'probe guarded control';
            if (withName) button.setAttribute('data-guard', withName);

            box.appendChild(button);
            return button;
        }

        it('refuses to press one, rather than pressing it and saying so after', async function () {
            var pressed = 0;
            guarded().addEventListener('click', function () { pressed++; });

            var out = await ask('click', { selector: '#probe-guarded' });
            clear();

            assert.ok(out.refused, 'a guarded control was pressed by the driver');
            assert.equal(pressed, 0, 'it was refused AND pressed, which is the worst of both');
        });

        //ASKED BEFORE ANYTHING IS TYPED. A field written to and then refused
        //has been written to.
        it('refuses to fill one before the value goes in', async function () {
            var box = scratch();
            var field = document.createElement('input');
            field.id = 'probe-guarded-field';
            field.className = 'form-control is-guarded';
            box.appendChild(field);

            var out = await ask('fill', { selector: '#probe-guarded-field', value: 'hunter2' });
            clear();

            assert.ok(out.refused, 'a guarded field was filled by the driver');
            assert.equal(field.value, '', 'it was refused after the value was already in');
        });

        //READING IS WHERE THE LEAK WAS. Measured on this app's own demo before
        //the guard covered `read`: the value of a password field a person had
        //unlocked came back over the wire with no dialog and no record.
        it('refuses to read one, which is the verb the hole was in', async function () {
            var box = scratch();
            var field = document.createElement('input');
            field.id = 'probe-guarded-secret';
            field.className = 'form-control is-guarded';
            field.value = 'hunter2';
            box.appendChild(field);

            var out = await ask('read', { selector: '#probe-guarded-secret' });
            clear();

            assert.ok(out.refused, 'a guarded value came back over the wire');
            assert.notEqual(out.value, 'hunter2', 'the value came back anyway');
        });

        //A MARK THAT CANNOT BE NAMED IS A COMMENT. There is nothing to ask
        //about, so it is refused rather than waved through -- and the refusal
        //says what to do about it.
        it('says what is wrong with a mark that names nothing', async function () {
            guarded();
            var out = await ask('click', { selector: '#probe-guarded' });
            clear();

            assert.ok(String(out.refused).indexOf('guard') >= 0, out.refused);
        });

        //THE MARK MAY BE ROUND IT RATHER THAN ON IT. A wrapper is just as valid
        //a place to put the class, and `closest` is what reads both -- a rule
        //written with `matches` would cover the button and miss the panel.
        it('honours a mark on something around it, not only on it', async function () {
            var box = scratch();
            box.className = 'is-guarded';

            var button = document.createElement('button');
            button.id = 'probe-guarded-inside';
            button.className = 'btn';
            button.textContent = 'inside a guarded region';
            box.appendChild(button);

            var out = await ask('click', { selector: '#probe-guarded-inside' });
            clear();

            assert.ok(out.refused, 'a mark on the wrapper was not read, so only closest() would');
        });

        //---- and the one field nobody has to remember to mark --------------
        //
        //A RULE RATHER THAN A MARK. Measured on this app's own demo before it
        //existed: `read "#f-plain"` handed back `hunter2` from an ORDINARY
        //password field -- unguarded, in no region, in a development build,
        //with no dialog and no record. Both marks could have covered it and
        //both rely on somebody thinking of it for every field added later.

        it('never reads a password back, mark or no mark', async function () {
            var box = scratch();
            var field = document.createElement('input');
            field.id = 'probe-password';
            field.type = 'password';
            field.value = 'hunter2';
            box.appendChild(field);

            var out = await ask('read', { selector: '#probe-password' });
            clear();

            assert.notEqual(out.value, 'hunter2', 'a password came back over the wire');
            assert.equal(out.value, null, 'the value was not withheld');
            assert.ok(out.withheld, 'it was withheld without saying so, which reads as an empty field');
        });

        //THE VALUE ONLY. A password box still has to be findable, describable
        //and contrast-checkable -- ../../../tools/drive.js measures every field
        //on twenty pages, and a field it cannot see is a field nobody checks.
        it('still says what the password field is and where', async function () {
            var box = scratch();
            var field = document.createElement('input');
            field.id = 'probe-password-shape';
            field.type = 'password';
            field.setAttribute('aria-label', 'Passphrase');
            box.appendChild(field);

            var out = await ask('read', { selector: '#probe-password-shape' });
            clear();

            assert.equal(out.element, 'input#probe-password-shape');
            assert.ok(out.text.indexOf('Passphrase') >= 0, 'it cannot even be named: ' + out.text);
            assert.ok(out.contrast, 'it cannot be measured');
        });

        //AND AN ORDINARY FIELD BESIDE IT IS NOT TOUCHED. A rule that withheld
        //every value would pass the two above and make the driver useless,
        //which is a failure no test that only checks refusals can see.
        it('reads an ordinary field beside it as it always did', async function () {
            var box = scratch();
            var field = document.createElement('input');
            field.id = 'probe-not-password';
            field.type = 'text';
            field.value = 'ordinary';
            box.appendChild(field);

            var out = await ask('read', { selector: '#probe-not-password' });
            clear();

            assert.equal(out.value, 'ordinary', 'an ordinary field stopped being readable');
            assert.ok(!out.withheld, 'it was withheld for no reason');
        });

        //AND AN UNMARKED CONTROL IS STILL PRESSED. A guard that refused
        //everything would pass every check above and break the whole app --
        //which is the shape of failure a test that only asserts refusals
        //cannot see.
        it('still presses one that is not marked at all', async function () {
            var box = scratch();
            var pressed = 0;

            var button = document.createElement('button');
            button.id = 'probe-plain';
            button.className = 'btn';
            button.textContent = 'plain probe control';
            button.addEventListener('click', function () { pressed++; });
            box.appendChild(button);

            var out = await ask('click', { selector: '#probe-plain' });
            clear();

            assert.ok(!out.refused, 'an unmarked control was refused: ' + out.refused);
            assert.equal(pressed, 1, 'it was allowed and not actually pressed');
        });
    });
    register();
}
module.exports = plugin;
