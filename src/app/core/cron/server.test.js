//SCHEDULING FROM THE HALF THAT KEEPS RESTARTING, which is the shape every real
//caller has: the plugin that owns a job lives here and re-registers on every
//save, while the clock keeps turning over in main.

plugin.consumes = ['selftest', 'cron', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var cron = imports.cron;
    var app = imports.app;

    var made = [];

    function probe(spec) {
        spec.name = 'probe-server-' + spec.name + '-' + process.pid;
        made.push(spec.name);
        return cron.add(spec);
    }

    function tidy() {
        made.forEach(function (name) { cron.forget(name); });
        made.length = 0;
    }

    describe('scheduling from the node half', function () {

        it('is the schedule main is turning, not one of its own', function () {
            assert.ok(app.host.cron, 'the host handed no cron over');

            try {
                var name = probe({ name: 'shared', every: 60000 }).name;
                assert.ok(app.host.cron.get(name), 'main cannot see the job this half added');
            } finally { tidy(); }
        });

        //THE PATTERN EVERY CALLER USES: describe the job, supply the work, own
        //the undo. `add` is safe to call again on every reload; `does` is what
        //has to be taken off and put back.
        it('describes a job and supplies the work, undoably', async function () {
            try {
                var name = probe({ name: 'pattern', every: 60000 }).name;
                var ran = 0;

                var undo = cron.does(name, function () { ran++; });

                await cron.fire(name);
                assert.equal(ran, 1);

                undo();
                await cron.fire(name);

                assert.equal(ran, 1, 'the work ran after being taken off');
                assert.equal(cron.get(name).armed, false);
            } finally { tidy(); }
        });

        //A JOB WHOSE WORK IS MISSING IS A NORMAL STATE HERE, not an error -- it
        //is what every job looks like for the moment between this bundle being
        //torn down and the next one registering.
        it('a job with nothing behind it records that, rather than throwing', async function () {
            try {
                var name = probe({ name: 'unarmed', every: 60000 }).name;

                await cron.fire(name);

                assert.equal(cron.get(name).lastOk, false);
                assert.equal(cron.get(name).lastWhy, 'nothing to run yet');
            } finally { tidy(); }
        });
    });

    register();
}
module.exports = plugin;
