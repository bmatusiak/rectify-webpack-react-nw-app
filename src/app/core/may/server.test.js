//WHAT THE APP IS ALLOWED TO DO, FROM THE HALF THAT KEEPS RESTARTING.
//
//This is the half a model reaches through the MCP tools, so what matters here
//is that it asks the same registry main does rather than one of its own.

plugin.consumes = ['selftest', 'may', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { may, app } = imports;

    describe('what the app is allowed to do, from the node half', function () {

        it('is the one main owns, not a second set of answers', function () {
            assert.ok(app.host.may, 'the host handed no permissions over');

            //THE SAME OBJECT. Two registries agreeing today is not one registry,
            //and the day they disagree is the day a `never` stops being one.
            assert.equal(may.asks('serve'), app.host.may.asks('serve'));
            assert.equal(may.decisions().length, app.host.may.decisions().length);
        });

        //THE RULE, FROM THE HALF MOST LIKELY TO TRY. A model reaching this app
        //arrives here, and this is where "just turn the guard off first" would
        //be attempted.
        //
        //IT ASKS ABOUT A PROBE AND NOT ABOUT `serve`, AND THAT IS THE POINT OF
        //THE WHOLE COMMENT. The first version of this called
        //`may.decide('serve', 'always', { window: true, trusted: true })` and
        //asserted `refused || decided` -- which is true whatever happens, so it
        //checked nothing. And because this half's `may` IS main's, the call went
        //through: every run of the suite left `serve` permanently allowed in the
        //real app. A test that asserts nothing and grants a permission is the
        //worst of both.
        it('cannot decide anything over the wire from here either', function () {
            var probe = 'probe-server-may-' + process.pid;
            var out = may.decide(probe, 'always', { overTheWire: true });

            assert.ok(out.refused, 'the node half decided something over the wire');
            assert.ok(out.refused.indexOf('open the window') > 0, out.refused);
        });

        //AND WHAT IT CAN DO, SAID PLAINLY RATHER THAN LEFT TO BE DISCOVERED.
        //
        //This half runs in the same process as main, so a call from here saying
        //it is a trusted window press is one main cannot check -- and that is
        //not a hole, because code running in this process could do the thing
        //itself without asking. What `may` protects is the app's SURFACE: the
        //control socket, the MCP tools, a driven window. See ./README.md.
        it('is not pretending to defend the app from its own code', function () {
            assert.equal(typeof may.decide, 'function');
            assert.equal(may.decide('probe-anything', 'always', { overTheWire: true }).decided, undefined);
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['declare', 'asks', 'decide', 'decisions'].forEach(function (fn) {
                assert.equal(typeof may[fn], 'function', fn + ' is missing');
            });

            assert.equal(typeof may, 'function', 'may itself is not callable');
            assert.ok(may.ANSWERS.length === 4);
        });

        it('answers about something nobody guards without asking anyone', async function () {
            var out = await may('probe-nobody-guards-this-' + process.pid);
            assert.equal(out.allowed, true);
        });
    });

    register();
}
module.exports = plugin;
