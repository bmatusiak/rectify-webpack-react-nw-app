//THE NODE HALF OF THE EXAMPLE PLUGIN, TESTED INSIDE THE APP.
//
//THIS FILE IS PART OF THE TEMPLATE, and that is most of its point. Every plugin
//in this scaffold carries a test beside it -- `test/plugin-scan.test.js` goes
//red for a context that has none -- so a template without one hands you a
//failing suite before you have written a line. Copy it along with the rest and
//change what the assertions are about.
//
//IT CONSUMES THE REAL SERVICES. A test here is itself a plugin, so the
//container resolves it after whatever it names and hands it the same `state`
//and `cron` the plugin beside it was given. There is nothing to mock and no
//second wiring to keep in step.

plugin.consumes = ['selftest', 'app', 'state', 'cron', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, state, cron, ipc } = imports;

    describe('the example plugin, on the node side', function () {

        //WHAT IT KEPT, READ BACK FROM THE SERVICE THAT KEPT IT -- not from the
        //file, which would be this test knowing where ../core/state puts things.
        it('counted this start in its own document', function () {
            var kept = state.doc('example').read({ starts: 0 });

            assert.ok(kept.starts > 0, 'it has never counted a start: ' + JSON.stringify(kept));
            assert.ok(kept.last, 'it did not write down when');
        });

        //DESCRIBED AND NOT SWITCHED ON, which is the distinction ../core/cron
        //exists to make: `add` survives a save, `does` does not, and neither of
        //them starts anything. A template that quietly ran a job every minute
        //would teach that by accident.
        it('described its job without switching it on', function () {
            var mine = cron.list().filter(function (job) { return job.name === 'example-heartbeat'; })[0];

            assert.ok(mine, 'no example-heartbeat in ' +
                cron.list().map(function (j) { return j.name; }).join(', '));

            assert.equal(mine.running, false, 'the template started its own job');
            assert.ok(mine.about, 'a job with no `about` is a name somebody has to guess at');
        });

        //ANSWERED FOR REAL, THROUGH ipc's OWN DOOR. `invoke` is how something
        //already inside this process calls a handler -- opening a socket to
        //ourselves to ask ourselves a question would be a strange way to do it.
        it('answers the terminal, and says what it was told', async function () {
            assert.ok(ipc.commands().indexOf('example') >= 0,
                'no `example` command: ' + ipc.commands().join(', '));

            var out = await ipc.invoke('example', { text: 'hello there' });

            assert.equal(out.hello, app.host.appPackage.title);
            assert.equal(out.youSaid, 'hello there');
            assert.equal(typeof out.pid, 'number');
            assert.ok(out.starts > 0);
        });
    });

    register();
}
module.exports = plugin;
