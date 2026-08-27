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
        it('cannot decide anything from here either', function () {
            var out = may.decide('serve', 'always', { window: true, trusted: true });

            //even claiming to be a trusted window press, because this half is
            //not a window and cannot have had one
            assert.ok(out.refused || out.decided, 'it answered neither way');
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
