//THE BOX, IN THE RUNNING APP.
//
//Every test here puts something in a container the whole app shares, and there
//is no `remove` on purpose -- a handed-over service is meant to last as long as
//main does. So every name used here is prefixed, and the suite is careful to
//claim each one exactly once: `put` throws on a second claim, which is the
//behaviour being checked and also the thing that would break a re-run.

plugin.consumes = ['selftest', 'handover'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var handover = imports.handover;

    //A FRESH NAME EVERY TIME IT IS ASKED FOR, not one per plugin load -- which
    //is a distinction this suite got wrong first and was told about by its own
    //subject. `put` refuses a second claim, so a prefix fixed when the plugin
    //loaded made the FIRST run pass and every re-run against the same live app
    //fail. Suites here are meant to be re-runnable without restarting anything.
    var run = 0;
    function fresh(label) { return 'probe-' + Date.now() + '-' + (run++) + '-' + label; }

    describe('what is handed across a reload', function () {

        it('takes a thing and gives it back by name', function () {
            var thing = { answer: 42 };
            var name = fresh('basic');

            assert.equal(handover.put(name, thing), thing, 'put did not hand it back');
            assert.equal(handover.get(name), thing, 'it came back as something else');
        });

        //TWO THINGS UNDER ONE NAME IS TWO ANSWERS TO THE SAME QUESTION, and the
        //loser of a silent race fails later, somewhere else, holding the wrong
        //object. So it throws rather than replacing or warning.
        it('refuses a second claim on a name', function () {
            var name = fresh('contested');
            handover.put(name, { first: true });

            var refused = null;
            try { handover.put(name, { second: true }); } catch (e) { refused = e; }

            assert.ok(refused, 'a second plugin took a name it did not own');
            assert.ok(refused.message.indexOf(name) >= 0, 'the refusal does not name it: ' + refused.message);
            assert.equal(handover.get(name).first, true, 'the first one was replaced anyway');
        });

        it('refuses a nameless one', function () {
            var refused = null;
            try { handover.put('', { x: 1 }); } catch (e) { refused = e; }
            assert.ok(refused, 'something was handed over under no name');

            refused = null;
            try { handover.put('   ', { x: 1 }); } catch (e) { refused = e; }
            assert.ok(refused, 'whitespace counted as a name');
        });

        //UNDEFINED RATHER THAN A THROW. A server half asks for its own main half
        //and has to carry on without one -- test/server-graph.test.js builds
        //server halves against a bare host, and throwing here would turn "there
        //is no main behind me" into "the app does not start".
        it('answers undefined for a name nobody put', function () {
            assert.equal(handover.get(fresh('never-put')), undefined);
            assert.equal(handover.get(''), undefined);
        });

        //A NAME OFF Object's PROTOTYPE would otherwise come back as a function,
        //and a lookup that answers with something plausible is worse than one
        //that answers nothing.
        it('is not fooled by a name that is on every object', function () {
            ['constructor', 'toString', 'hasOwnProperty', '__proto__'].forEach(function (name) {
                assert.equal(handover.get(name), undefined, name + ' came back as something');
            });
        });

        it('says what it is carrying', function () {
            var name = fresh('listed');
            handover.put(name, { x: 1 });

            var names = handover.names();
            assert.ok(names.indexOf(name) >= 0, 'it is not in the list: ' + names.join(', '));

            //sorted, so a person reading the host sees a stable order rather
            //than whatever order the graph happened to load in
            assert.equal(names.slice().sort().join(','), names.join(','), 'the list is not sorted');
        });

        //WHERE IT COMES OUT IS NOT CHECKABLE FROM HERE. `of` is on the host the
        //node half is handed, and in THIS context the host is merged onto `app`
        //rather than hanging off it -- there is no `app.host` in main to look at.
        //
        //So the two halves of that claim are checked where each can be seen:
        //test/handover.test.js reads `of: handover.get` out of ../build/main.js,
        //and ../dataDir/server.test.js proves the host mechanism carries a real
        //service end to end.
        it('is the same container the graph handed out', function () {
            assert.equal(imports.handover, handover, 'two containers is two boxes');
            assert.equal(typeof handover.get, 'function');
            assert.equal(typeof handover.names, 'function');
        });
    });

    register();
}
module.exports = plugin;
