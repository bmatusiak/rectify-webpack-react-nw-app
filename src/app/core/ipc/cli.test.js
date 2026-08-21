var os = require('os');
var path = require('path');
var harness = require('@bmatusiak/rectify/harness.js');

var endpoint = require('./endpoint');

//the cli half of ipc, checked against the real service the container built.
//
//deliberately nothing here about whether an app answers: a developer running
//the app while the tests run would flip that result, and a test that depends
//on what else is open is worse than no test. What is checked is what is true
//either way -- that both ends work out the same address, and that the secret
//is not kept inside the thing it guards.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { app, ipc } = imports;
    var name = app.appPackage.name;

    describe('the control socket address', function () {

        it('is the one this app derives from its own name', function () {
            assert.equal(ipc.address, endpoint(name));
        });

        it('is a pipe on windows and a socket file everywhere else', function () {
            if (process.platform === 'win32') {
                assert.ok(ipc.address.indexOf('pipe') >= 0, ipc.address);
            } else {
                assert.equal(ipc.address, path.join(os.tmpdir(), name + '.sock'));
            }
        });

        it('is different for a differently named app', function () {
            assert.notEqual(endpoint(name), endpoint(name + '-other'));
        });
    });

    describe('the token', function () {

        it('sits beside the socket, not inside it', function () {
            //on posix both live in the temp directory, and writing the token
            //over the socket path would take the app's address away from it
            assert.notEqual(endpoint.token(name), endpoint(name));
        });

        it('is named after the app, so two of them do not share one', function () {
            assert.notEqual(endpoint.token(name), endpoint.token(name + '-other'));
            assert.ok(endpoint.token(name).indexOf(name) >= 0, endpoint.token(name));
        });

        it('is somewhere only this account can read', function () {
            //the temp directory is per-user on windows; on posix the file is
            //written 0600, which is the half of it this side cannot check
            assert.ok(endpoint.token(name).indexOf(os.tmpdir()) === 0, endpoint.token(name));
        });
    });

    describe('what the cli exposes', function () {

        it('offers a call and a way to ask whether anyone is there', function () {
            assert.equal(typeof ipc.call, 'function');
            assert.equal(typeof ipc.running, 'function');
        });
    });

    register();
}
module.exports = plugin;
