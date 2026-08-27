//two stores from one factory, differing only in which browser storage they sit
//on: `settings` is localStorage and survives a restart, `session` is
//sessionStorage and does not. Both are real browser objects, so this is the
//only place the difference is a fact rather than an assumption.

plugin.consumes = ['selftest', 'preferences', 'session'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { preferences, session } = imports;

    describe('the stores, against real browser storage', function () {

        it('hands back the defaults it was given', function () {
            var store = session('probe.defaults', { a: 1, b: 'two', c: false });

            assert.equal(store.a, 1);
            assert.equal(store.b, 'two');
            assert.equal(store.c, false);
        });

        //A DEFAULT IS WRITTEN DOWN THE FIRST TIME, and the test above cannot see
        //whether it was: every read comes back from MEMORY, so a store that
        //never persisted anything answers exactly like one that did. Its own
        //sabotage found that by surviving -- the write was removed and every
        //assertion still passed.
        //
        //WHAT IS ON DISK IS THE ONLY PLACE THE DIFFERENCE SHOWS. A store that is
        //only half written comes back half empty in the next window, which is
        //the one moment nobody is watching.
        it('writes the defaults down, not just into memory', function () {
            var name = 'probe.persisted.' + Date.now();

            try {
                session(name, { kept: 'yes', n: 3 });

                var raw = sessionStorage.getItem(name);
                assert.ok(raw, 'nothing at all was written for ' + name);

                var back = JSON.parse(raw);
                assert.equal(back.kept, 'yes', 'the default never reached storage: ' + raw);
                assert.equal(back.n, 3, raw);
            } finally { sessionStorage.removeItem(name); }
        });

        //A FRESH NAME EVERY RUN, AND TAKEN AWAY AFTER.
        //
        //THIS USED TO USE A FIXED `probe.writes` AND NEVER CLEAN UP, so the 7 it
        //wrote stayed in sessionStorage for the life of the browser profile --
        //and every later run read that leftover instead of what it had just
        //written. Its own sabotage found it: the write-through was removed and
        //the check still passed, on a value put there days earlier.
        //
        //A TEST THAT PASSES ON ITS OWN LITTER IS WORSE THAN NO TEST. It is right
        //the first time and right for the wrong reason ever after.
        it('writes through on assignment, with no save to remember', function () {
            var name = 'probe.writes.' + Date.now();

            try {
                var store = session(name, { count: 0 });
                store.count = 7;

                //a second handle on the same name reads what the first wrote
                assert.equal(session(name, { count: 0 }).count, 7);

                //and it really is in storage rather than in the handle
                assert.equal(JSON.parse(sessionStorage.getItem(name)).count, 7,
                    'the value never left memory: ' + sessionStorage.getItem(name));
            } finally { sessionStorage.removeItem(name); }
        });

        it('puts preferences in localStorage and session in sessionStorage', function () {
            preferences('probe.where', { x: 'local' }).x = 'local';
            session('probe.where', { x: 'temporary' }).x = 'temporary';

            assert.ok(String(localStorage.getItem('probe.where')).indexOf('local') >= 0,
                'preferences did not land in localStorage');
            assert.ok(String(sessionStorage.getItem('probe.where')).indexOf('temporary') >= 0,
                'session did not land in sessionStorage');

            //and they do not read each other, despite sharing a name
            assert.equal(preferences('probe.where', { x: '' }).x, 'local');
            assert.equal(session('probe.where', { x: '' }).x, 'temporary');
        });

        it('survives a value that json cannot round trip unchanged', function () {
            var store = session('probe.types', { n: 0, s: '', flag: false, list: [] });

            store.n = 12.5;
            store.s = 'with "quotes" and a \ backslash';
            store.flag = true;
            store.list = [1, 2, 3];

            var again = session('probe.types', { n: 0, s: '', flag: false, list: [] });
            assert.equal(again.n, 12.5);
            assert.equal(again.s, 'with "quotes" and a \ backslash');
            assert.equal(again.flag, true);
            assert.equal(again.list.join(','), '1,2,3');
        });

        it('will not take a field called save, and says so', function () {
            //save is the store's own writer. It used to skip a default of that
            //name in silence, which is how a checkout field called `save` ended
            //up being the function and reaching react as `checked`.
            var complained = false;
            var said = console.warn;
            console.warn = function () { complained = true; said.apply(console, arguments); };

            try {
                var store = session('probe.save', { save: false, other: 1 });
                assert.equal(typeof store.save, 'function', 'the writer was shadowed');
                assert.equal(store.other, 1, 'the rest of the defaults were dropped');
            } finally {
                console.warn = said;
            }

            assert.ok(complained, 'it skipped the field without saying anything');
        });
    });

    register();
}
module.exports = plugin;
