//THE NODE HALF WRITES INTO THE LOG MAIN IS KEEPING, which is the whole claim.
//
//This half holds nothing on purpose: it is rebuilt on every save, and a log kept
//here would empty several times a minute during ordinary development -- exactly
//when somebody is asking what just happened.

plugin.consumes = ['selftest', 'log', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var log = imports.log;
    var app = imports.app;

    describe('the log, from the node half', function () {

        it('is the one main is keeping, not a second one', function () {
            assert.ok(app.host.log, 'the host handed no log over');

            var entry = log.add(['probe', 'server'], 'written from the node half');

            //the same store, asked through the host rather than through the
            //service -- if these are two objects, they are two logs
            var seen = app.host.log.since(entry.id - 1)
                .filter(function (e) { return e.id === entry.id; })[0];

            assert.ok(seen, 'the line is not in the log main keeps');
            assert.equal(seen.text, 'written from the node half');
        });

        it('tags from here look the same as tags from there', function () {
            var mine = log.on('probe', 'server');
            var one = mine.info('hello from the node half');

            assert.ok(one.tags.indexOf('probe') >= 0 && one.tags.indexOf('server') >= 0);
            assert.equal(one.level, 'info');
        });

        //REDACTION IS MAIN'S, SO IT APPLIES TO EVERY WAY IN. A second entry
        //point that skipped it would be the hole -- and the node half is where
        //command output actually comes from.
        it('a credential written from here is redacted too', function () {
            var entry = log.add(['probe'], 'token=abcdef1234567890');

            assert.ok(entry.text.indexOf('abcdef1234567890') < 0, entry.text);
            assert.ok(entry.text.indexOf('token') >= 0, 'it lost the name as well: ' + entry.text);
        });

        //A LINE SURVIVES THIS HALF BEING REBUILT, which is the reason the log is
        //not kept here. The suite cannot force a reload, so what it checks is the
        //property that makes it true: the entries are not in this bundle.
        it('what it wrote outlives this bundle', function () {
            var entry = log.add(['probe'], 'still here after a reload');
            var all = app.host.log.all();

            assert.ok(all.some(function (e) { return e.id === entry.id; }),
                'the line is only in this half, so a save would take it');
        });
    });

    register();
}
module.exports = plugin;
