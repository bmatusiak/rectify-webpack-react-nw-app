//THE RECORD, FROM THE HALF THAT KEEPS RESTARTING.
//
//Which is the half that most needs it, and the reason the record does not live
//here: this bundle is rebuilt on every save, so a record kept here would be
//emptied by the very restarts it exists to remember.

plugin.consumes = ['selftest', 'events', 'app', 'log'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { events, app, log } = imports;

    describe('what the app has done, from the node half', function () {

        it('is the one main owns, not a second record', function () {
            assert.ok(app.host.events, 'the host handed no record over');
            assert.equal(events.where, app.host.events.where);
        });

        //THE POINT OF HANDING IT OVER. A line written from this half has to
        //reach the record main is keeping -- otherwise everything the node half
        //does is missing from the answer to "what happened", and this is the
        //half where an app's work actually happens.
        it('an act from this half reaches the record main is keeping', function () {
            var text = 'probe from the node half ' + Date.now();

            log.on('app').info(text);

            assert.ok(app.host.events.all({ limit: 50 }).filter(function (e) {
                return e.text === text;
            })[0], 'main never heard about it');
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['keep', 'all', 'clear', 'worthKeeping', 'scrub'].forEach(function (fn) {
                assert.equal(typeof events[fn], 'function', fn + ' is missing');
            });

            //`kept` IS THE ONE WORD THAT MATTERS WHEN THERE IS NO MAIN. This
            //half carries on rather than refusing -- losing a note costs a line
            //-- so without it a caller cannot tell an empty record from one
            //nothing is writing, and those are opposite answers.
            assert.equal(typeof events.kept, 'boolean');
            assert.equal(events.kept, true, 'this app has a main half, so it is being kept');
        });
    });

    register();
}
module.exports = plugin;
