//THE SAME DRAWER FROM THE HALF THAT KEEPS RESTARTING, which is the whole claim:
//two answers to "where does this live" is how the half that saves writes into one
//folder and the half that reads looks in another.

plugin.consumes = ['selftest', 'state', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var state = imports.state;
    var app = imports.app;

    var name = 'probe-server-' + process.pid;

    describe('what the node half keeps', function () {

        it('is the drawer main owns, not one of its own', function () {
            assert.ok(app.host.state, 'the host handed no state over');
            assert.equal(state.where, app.host.state.where);
        });

        it('writes something main can read back', function () {
            var doc = state.doc(name);

            try {
                doc.write({ from: 'the node half' });

                //asked through the host rather than through the service: if
                //these are two objects, they are two drawers
                var seen = app.host.state.doc(name).read(null);

                assert.ok(seen, 'main cannot see what this half wrote');
                assert.equal(seen.from, 'the node half');
            } finally {
                doc.forget();
            }
        });

        it('has the whole surface, not a narrower stand-in', function () {
            assert.equal(typeof state.doc, 'function');
            assert.equal(typeof state.names, 'function');
            assert.equal(typeof state.where, 'string');
        });

        //A DOCUMENT WRITTEN HERE OUTLIVES THIS BUNDLE, which is the reason state
        //is not kept in this half. The suite cannot force a reload, so it checks
        //the property that makes it true: the file is on disk, not in memory.
        it('what it wrote is on disk rather than in this bundle', function () {
            var doc = state.doc(name);

            try {
                doc.write({ durable: true });
                assert.ok(doc.path.indexOf(state.where) === 0, doc.path + ' is not in the drawer');
                assert.equal(require('node:fs').existsSync(doc.path), true);
            } finally {
                doc.forget();
            }
        });
    });

    register();
}
module.exports = plugin;
