//SECRETS FROM THE HALF THAT KEEPS RESTARTING, which is where a plugin that has
//one actually lives.

plugin.consumes = ['selftest', 'secret', 'app'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var secret = imports.secret;
    var app = imports.app;

    var one = 'probe-server-' + process.pid;

    describe('keeping something from the node half', function () {

        it('is the one main owns, not a second store', function () {
            assert.ok(app.host.secret, 'the host handed no secret over');
            assert.equal(secret.where, app.host.secret.where);
        });

        it('keeps something main can read back', function () {
            try {
                secret.keep(one, 'a-token-from-the-node-half');
                assert.equal(app.host.secret.read(one), 'a-token-from-the-node-half');
            } finally {
                secret.forget(one);
            }
        });

        //THE POINT OF THE WHOLE PLUGIN, checked from the side that will actually
        //use it: what is on disk is not what was kept.
        it('what it wrote is not readable as the value', function () {
            if (!secret.can) return;//nothing is sealed here, and main.test.js says so

            try {
                secret.keep(one, 'unmistakable-probe-value');

                var raw = require('node:fs').readFileSync(secret.where + require('node:path').sep +
                    one + '.sealed', 'utf8');

                assert.equal(raw.indexOf('unmistakable-probe-value'), -1, 'it is sitting in cleartext');
                assert.equal(secret.sealed(one), true);
            } finally {
                secret.forget(one);
            }
        });

        it('has the whole surface, not a narrower stand-in', function () {
            ['keep', 'read', 'forget', 'sealed', 'names', 'seal', 'open', 'isSealed']
                .forEach(function (fn) {
                    assert.equal(typeof secret[fn], 'function', fn + ' is missing');
                });

            assert.equal(typeof secret.can, 'boolean');
        });
    });

    register();
}
module.exports = plugin;
