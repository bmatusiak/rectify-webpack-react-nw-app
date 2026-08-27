//WHAT THIS APP IS ALLOWED TO DO, IN THE APP THAT DECIDES IT.
//
//./node.test.js has the rule -- what an answer means, who may give one, what an
//unreadable file means. What needs the real app is the seam: that a capability
//declared by a plugin is really guarded, that the command line is really
//refused, and that a decision really reaches ../state.
//
//NOTHING HERE ANSWERS A PROMPT. A prompt needs a person, and a suite that could
//answer one would be a suite proving the opposite of what this plugin claims.

plugin.consumes = ['selftest', 'may', 'state', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { may, state } = imports;

    var probe = 'probe-may-' + process.pid;

    function forget() {
        try {
            var doc = state.doc('may');
            var was = doc.read({ decisions: {} });

            delete was.decisions[probe];
            doc.write(was);
        } catch (e) { /* never written */ }
    }

    describe('what the app is allowed to do', function () {

        //THE CODE PROPOSES. A capability nobody declared is not guarded, and
        //saying so is what lets `may` be called on anything without every
        //caller first checking whether it needs to be.
        it('guards only what something declared', async function () {
            assert.equal(may.asks('probe-nobody-declared-this'), false);

            var out = await may('probe-nobody-declared-this');
            assert.equal(out.allowed, true, 'it guarded something nobody guards');
        });

        it('guards what the app really declared', function () {
            assert.equal(may.asks('serve'), true, 'serve is not guarded');
            assert.equal(may.asks('markup'), true, 'markup is not guarded');
        });

        //A DECISION REACHES ../state, which is what makes `always` outlive the
        //restart it is promising to outlive.
        it('writes an always down where it survives a restart', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                assert.equal(may.asks(probe), true);

                var out = may.decide(probe, 'always', { window: true, trusted: true });
                assert.equal(out.decided, 'always', out.refused);

                var kept = state.doc('may').read({ decisions: {} });
                assert.ok(kept.decisions[probe], 'nothing was written down');
                assert.equal(kept.decisions[probe].answer, 'always');
            } finally { forget(); undo(); }
        });

        //`once` AND `run` ARE NOT WRITTEN DOWN. Storing `once` is a
        //contradiction, and a stored `run` would outlive the run it was for.
        it('does not write down an answer that was not for keeping', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                may.decide(probe, 'run', { window: true, trusted: true });

                var kept = state.doc('may').read({ decisions: {} });
                assert.equal(kept.decisions[probe], undefined, 'a run answer was written down');
            } finally { forget(); undo(); }
        });

        //THE RULE THE REST IS BUILT ON, checked against the real service rather
        //than the module: a guard the command line can remove is not a guard.
        it('refuses a decision that came over the wire', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                var out = may.decide(probe, 'always', { overTheWire: true });

                assert.ok(out.refused, 'the control socket decided something');
                assert.ok(out.refused.indexOf('open the window') > 0, out.refused);

                var kept = state.doc('may').read({ decisions: {} });
                assert.equal(kept.decisions[probe], undefined, 'it wrote it down anyway');
            } finally { forget(); undo(); }
        });

        it('refuses a decision from a press that was not a person\'s', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                var out = may.decide(probe, 'always', { window: true, trusted: false });
                assert.ok(out.refused, 'a driven click decided something');
            } finally { forget(); undo(); }
        });

        //A NEVER IS AN ANSWER AND NOT A QUESTION, so nothing gets asked about
        //it again -- which is the difference between a decision and a nag.
        it('a never is answered without asking anybody', async function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                may.decide(probe, 'never', { window: true, trusted: true });

                var out = await may(probe);
                assert.equal(out.allowed, false);
                assert.ok(!out.ask, 'it wanted to ask about something already refused');
            } finally { forget(); undo(); }
        });

        //`always` WITHOUT A WAY BACK IS A ONE-WAY DOOR. A person who allowed
        //something and changed their mind had no way to say so, which makes the
        //easy answer the dangerous one -- and teaches people to answer `once` to
        //everything for ever rather than ever pressing it.
        it('can take a written answer back', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                may.decide(probe, 'always', { window: true, trusted: true });
                assert.ok(state.doc('may').read({ decisions: {} }).decisions[probe],
                    'nothing was written down to take back');

                var out = may.forget(probe, { window: true, trusted: true });
                assert.equal(out.forgotten, probe, out.refused);

                var kept = state.doc('may').read({ decisions: {} });
                assert.equal(kept.decisions[probe], undefined, 'the answer is still on disk');

                //FORGETTING IS NOT REFUSING. It puts the capability back to
                //nobody having said, so the next outside caller is asked --
                //which is a different thing from it being answered `never`.
                assert.equal(may.decisions().filter(function (one) {
                    return one.name === probe;
                })[0].answer, null, 'it left an answer behind');
            } finally { forget(); undo(); }
        });

        //THE SAME RULE, IN THE DIRECTION THAT LOOKS HARMLESS. Forgetting can
        //only ever make the app do less, so it is tempting to let anything do
        //it -- but a driven run that could forget things could clear a `never`,
        //and the next caller would be asked about something a person had
        //already refused. A refusal quietly becoming a question again is the
        //one failure this plugin cannot have.
        it('refuses to forget over the wire, and refuses a driven press too', function () {
            var undo = may.declare(probe, { about: 'a probe' });

            try {
                may.decide(probe, 'never', { window: true, trusted: true });

                var wire = may.forget(probe, { overTheWire: true });
                assert.ok(wire.refused, 'the control socket cleared a never');
                assert.ok(wire.refused.indexOf('open the window') > 0, wire.refused);

                var driven = may.forget(probe, { window: true, trusted: false });
                assert.ok(driven.refused, 'a driven click cleared a never');

                assert.equal(state.doc('may').read({ decisions: {} }).decisions[probe].answer,
                    'never', 'the never did not survive being asked to go');
            } finally { forget(); undo(); }
        });

        it('lists what a person has decided, with what the code said it was for', function () {
            var found = may.decisions().filter(function (one) { return one.name === 'serve'; })[0];

            assert.ok(found, 'serve is not in the list');
            assert.ok(found.about && found.about.length > 0, 'it does not say what serve is');
        });
    });

    register();
}
module.exports = plugin;
