//THE DRAWERS, FROM THE HALF THAT KEEPS RESTARTING.
//
//Which is the half that most needs them, and the reason they are not kept here.

plugin.consumes = ['selftest', 'cached', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { cached, app } = imports;

    describe('answers already worked out, from the node half', function () {

        //THE CLAIM THAT WOULD BREAK SILENTLY. Move the drawers into this bundle
        //and everything still works -- the cache is simply cold after every
        //save, which is invisible except as the app feeling slow while somebody
        //is working on it. Nothing but this says which half is holding them.
        it('is the one main owns, not a second cache', function () {
            assert.ok(app.host.cached, 'the host handed no drawers over');
            assert.equal(cached.where, app.host.cached.where);

            //the same OBJECT, not merely the same path: two caches agreeing
            //about where they would write is not the same as one cache
            var mine = cached.byContent('probe-shared-' + process.pid);
            var seen = app.host.cached.stats().drawers.filter(function (d) {
                return d.name === mine.name;
            })[0];

            assert.ok(seen, 'main has never heard of a drawer this half just made');
        });

        it('really writes things down here', function () {
            assert.equal(cached.persists, true, 'nothing survives a restart');
            assert.ok(cached.where, 'it will not say where');
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['byContent', 'byStamp', 'whileFresh', 'stale', 'stats', 'forgetEverything']
                .forEach(function (fn) {
                    assert.equal(typeof cached[fn], 'function', fn + ' is missing');
                });

            assert.equal(typeof cached.persists, 'boolean');
        });

        //THE DOOR THAT BREAKS THE RULE ON PURPOSE, and the thing that makes it
        //honest: a write drops it, and leaves the two that cannot be wrong.
        it('a write drops the clock-keyed answers and nothing else', async function () {
            var fresh = cached.whileFresh('probe-fresh-' + process.pid, 60000);
            var content = cached.byContent('probe-kept-' + process.pid);

            try {
                await fresh.get('k', function () { return 'before'; });
                await content.get('a-sha', function () { return 'true for ever'; });

                cached.stale();

                assert.equal(await fresh.get('k', function () { return 'after'; }), 'after',
                    'a write left a clock-keyed answer in place');

                assert.equal(await content.get('a-sha', function () { return 'recomputed'; }),
                    'true for ever',
                    'a write threw away an answer that could not have been wrong');
            } finally {
                fresh.clear();
                content.clear();
            }
        });
    });

    register();
}
module.exports = plugin;
