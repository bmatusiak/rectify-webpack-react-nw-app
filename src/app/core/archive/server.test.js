//FILES, FROM THE HALF THAT KEEPS RESTARTING.
//
//Which is the half that is handed most of them: a run finishes, something prints
//a report, a build produces a binary. The folder is main's, for the same reason
//the log is.

plugin.consumes = ['selftest', 'archive', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { archive, app } = imports;

    describe('files the app was handed, from the node half', function () {

        it('is the one main owns, not a second folder', function () {
            assert.ok(app.host.archive, 'the host handed no archive over');
            assert.equal(archive.where, app.host.archive.where);
        });

        //KEPT HERE AND SEEN THERE. Two halves each working out where files go is
        //how something gets written into one folder by the half that saves it
        //and looked for in another by the half that reads it.
        it('what this half keeps, main can read', function () {
            var name = 'probe-server-' + process.pid;
            var mine = archive.store(name);

            try {
                mine.keep('from-the-node-half.txt', 'written over here');

                var theirs = app.host.archive.store(name);
                assert.equal(theirs.read('from-the-node-half.txt').text, 'written over here');
            } finally {
                //`drop` AND NOT `empty`: emptying leaves the directory, which is
                //right for a drawer somebody may put something back in and wrong
                //for a probe. This suite ran once and left `probe-server-<pid>`
                //sitting in the real archive folder.
                mine.drop();
            }
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['store', 'stores', 'nameIsOk'].forEach(function (fn) {
                assert.equal(typeof archive[fn], 'function', fn + ' is missing');
            });

            assert.ok(archive.here, 'the namespaced half is missing');
            assert.equal(typeof archive.here.store, 'function');
            assert.equal(typeof archive.MOST, 'number');
            assert.equal(typeof archive.READABLE, 'number');
        });

        //THE RULE IS ASKABLE BEFORE ANYTHING IS KEPT, which is a question a
        //caller has that cannot be answered after the fact: "I will take this
        //file if you can store it under that name".
        it('says whether a name would be accepted, without keeping anything', function () {
            assert.equal(archive.nameIsOk('build.zip'), null);
            assert.ok(archive.nameIsOk('../escape'));
            assert.equal(archive.stores().indexOf('../escape'), -1);
        });
    });

    register();
}
module.exports = plugin;
