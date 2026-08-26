//THE SAME ANSWER ON THIS SIDE, OR AN HONEST REFUSAL.
//
//The node half does not work the path out -- ./main.js does, and ../build hands
//it over. What is worth pinning is that it is the SAME path: two answers to
//"where does it live" is how something gets written by the half that saves it
//and looked for by the half that reads it, in different folders.

plugin.consumes = ['selftest', 'dataDir', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var dataDir = imports.dataDir;
    var app = imports.app;

    describe('where the node half keeps things', function () {

        it('is the very thing main worked out, not a second derivation', function () {
            //the host is what carries it, so this is also a check that
            //../build/main.js is still putting it there
            assert.ok(app.host.dataDir, 'the host handed no dataDir over');
            assert.equal(dataDir.path, app.host.dataDir.path);
            assert.equal(dataDir.from, app.host.dataDir.from);
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['at', 'ensure'].forEach(function (name) {
                assert.equal(typeof dataDir[name], 'function', name + ' is missing');
            });

            assert.equal(typeof dataDir.path, 'string');
            assert.equal(typeof dataDir.from, 'string');
        });

        it('joins a path inside itself, the same way', function () {
            assert.equal(dataDir.at('x', 'y.json'), app.host.dataDir.at('x', 'y.json'));
        });
    });

    register();
}
module.exports = plugin;
