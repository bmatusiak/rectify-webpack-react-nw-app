var fs = require('fs');
var path = require('path');

//lifecycle owns shutting down, and nothing here calls it. That is not caution
//for its own sake: a test that shuts the app down mid-suite takes every test
//after it with it, which is exactly what happened the first time one of these
//called quit against the real app instead of a mock.
//
//what is left to check is the file it writes, which is how `npm start` twice
//finds the copy already running instead of launching a second one.

plugin.consumes = ['selftest', 'app', 'lifecycle', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, lifecycle } = imports;

    var instanceFile = path.join(app.root, '.nw-instance.json');

    describe('lifecycle, in the running app', function () {

        it('is not shutting down, which is why this is running', function () {
            assert.equal(lifecycle.isShuttingDown, false);
        });

        it('wrote down where to find this copy', function () {
            if (app.isPackaged) return;//a package has no launcher reading it

            assert.ok(fs.existsSync(instanceFile), instanceFile + ' is not there');

            var said = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
            assert.equal(said.pid, process.pid, 'it names another process');
            assert.ok(said.url, 'no url in it');
        });

        it('writes nothing when packaged, since nothing reads it', function () {
            if (!app.isPackaged) return;
            assert.ok(!fs.existsSync(instanceFile), 'a package wrote an instance file');
        });

        it('offers a way down without being asked to take it', function () {
            assert.equal(typeof lifecycle.shutdown, 'function');
        });
    });

    //---- and whether the app is up, asked of the half that always is -------

    describe('health', function () {

        it('says what this app is, and that it is running', async function () {
            var out = await imports.ipc.invoke('health');

            assert.ok(out.title, 'it does not say which app it is');
            assert.equal(typeof out.packaged, 'boolean');
            assert.equal(out.pid, process.pid);
        });

        //THE FIELD tools/drive.js CAME HERE FOR. It refuses to drive a source
        //tree when it was asked for a package, and it was getting `packaged`
        //from src/app/demo -- a core tool depending on the folder the scaffold
        //promises is deletable.
        it('carries packaged, so nothing has to ask the demo', async function () {
            var out = await imports.ipc.invoke('health');
            assert.equal(out.packaged, !!app.isPackaged);
        });

        //MAIN CAN SEE THE WINDOW WITHOUT ANYTHING INSIDE IT BEING ALIVE, which
        //is the whole reason this command is here rather than in the node half.
        //
        //WAITED FOR RATHER THAN ASSUMED. Run seconds after a restart this was
        //red, because nw had not handed main a window yet -- a test that
        //depends on how soon after boot you ask is the flakiness this repo
        //spends its comments on. `npm test` waits for a view before asking for
        //any suite; this makes the same true when a person runs it by hand.
        it('can see the window from main', async function () {
            var out = null;
            var deadline = Date.now() + 10000;

            while (Date.now() < deadline) {
                out = await imports.ipc.invoke('health');
                if (out.window.attached) break;
                await new Promise(function (r) { setTimeout(r, 100); });
            }

            assert.equal(out.window.attached, true, 'main never saw its own window');
            assert.equal(typeof out.window.connected, 'boolean');
        });

        //`trouble` IS THE TEXT, NOT A BOOLEAN. "Something failed" sends
        //somebody looking; the first line of the message usually ends the
        //search. With a healthy app it is null, and `ok` says so in one word.
        it('says nothing is wrong when nothing is', async function () {
            var out = await imports.ipc.invoke('health');

            assert.equal(out.window.trouble, null, 'the app is showing: ' + out.window.trouble);
            assert.equal(out.ok, true);
        });
    });

    register();
}
module.exports = plugin;
