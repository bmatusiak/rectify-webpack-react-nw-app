//WHERE YOU WERE, IN THE WINDOW THAT IS DOING THE REMEMBERING.
//
//./node.test.js has the rule and every state a fake can be put in. What is left
//for here is the two things only a real window can answer: that this is sitting
//on the storage that SURVIVES the window, and that the hook really writes
//through when a person changes something.
//
//THE HOOK IS NOT CALLED HERE, and that is not a gap. A hook outside a render is
//an error, and mounting a component to press it would be testing react. The
//demo already calls it on every page change -- so what this asks is what the
//demo LEFT BEHIND in storage, which is the same claim reached from the far end.

plugin.consumes = ['selftest', 'remember', 'preferences', 'session'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var remember = imports.remember;

    var area = 'probe.remember';

    function forget() {
        try { localStorage.removeItem(area); } catch (e) { /* nothing to undo */ }
    }

    describe('where you were', function () {

        //THE STORE BELONGS TO THE APP, not to this suite -- the same rule
        //../pages's tests found: a run that leaves its probe behind is a run
        //that changed the app somebody is using.
        it('writes through to the storage that survives the window', function () {
            try {
                assert.equal(remember.write(area, 'page', 'plumbing'), true);

                //localStorage, NOT sessionStorage. Reading the raw item is the
                //only way to tell them apart from in here, and telling them
                //apart is the whole reason this plugin exists rather than the
                //demo keeping its page in `session` as it used to.
                var raw = localStorage.getItem(area);
                assert.ok(raw, 'nothing in localStorage under ' + area);
                assert.equal(JSON.parse(raw).page, 'plumbing');

                assert.equal(sessionStorage.getItem(area), null,
                    'it is sitting in sessionStorage, which dies with the window');

                assert.equal(remember.read(area, 'page', 'first'), 'plumbing');
            } finally { forget(); }
        });

        //THE RULE, AGAINST THE REAL STORE. ./node.test.js proves the refusal
        //decides correctly; this proves nothing reached disk when it refused.
        it('refuses a credential against the app\'s own store', function () {
            try {
                var token = 'ghp_' + new Array(37).join('D');

                assert.equal(remember.write(area, 'token', token), false);
                assert.equal(localStorage.getItem(area), null, 'it was written anyway');
            } finally { forget(); }
        });

        //WHAT THE DEMO LEFT BEHIND, which is the hook answered from the far end.
        //A `use` that read but never wrote would pass every test in
        //./node.test.js and leave nothing here.
        it('is what the demo is keeping its open page in', function () {
            var raw = localStorage.getItem('demo.ui');
            assert.ok(raw, 'the demo has not written its page to localStorage');

            var page = JSON.parse(raw).page;
            assert.ok(page && String(page).length > 0, 'no page kept: ' + raw);

            //AND NOT IN THE ONE IT USED TO USE. This is the regression that
            //would look like nothing at all: the demo goes back to `session`,
            //everything still works for as long as the window is open, and the
            //next restart quietly opens on page one again.
            assert.equal(sessionStorage.getItem('demo.ui'), null,
                'the demo is keeping its page in sessionStorage, which dies with the window');
        });
    });

    register();
}
module.exports = plugin;
