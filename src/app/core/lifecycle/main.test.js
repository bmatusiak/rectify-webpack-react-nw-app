var fs = require('fs');
var path = require('path');

//lifecycle owns shutting down, and nothing here calls it. That is not caution
//for its own sake: a test that shuts the app down mid-suite takes every test
//after it with it, which is exactly what happened the first time one of these
//called quit against the real app instead of a mock.
//
//what is left to check is the file it writes, which is how `npm start` twice
//finds the copy already running instead of launching a second one.

plugin.consumes = ['selftest', 'app', 'lifecycle'];
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

    register();
}
module.exports = plugin;
