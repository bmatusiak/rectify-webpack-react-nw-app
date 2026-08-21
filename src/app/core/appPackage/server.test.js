
//appPackage exists as its own plugin because it used to be registered by io --
//convenient, since in the window it arrives over the socket, and wrong, because
//it meant wanting the app's name made you consume a socket.
//
//so what is worth checking is that the cut held: this is the host's own copy,
//handed over unchanged, with nothing of the transport left on it.

plugin.consumes = ['selftest', 'app', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, appPackage } = imports;

    describe('appPackage, server side', function () {

        it('is what the host was given, not a copy that can drift', function () {
            assert.equal(appPackage.name, app.host.appPackage.name);
            assert.equal(appPackage.version, app.host.appPackage.version);
            assert.equal(appPackage.title, app.host.appPackage.title);
        });

        it('carries the three things anything asking for it wants', function () {
            ['title', 'name', 'version'].forEach(function (key) {
                assert.ok(appPackage[key], key + ' is missing');
            });
        });

        it('is not a socket, and does not bring one with it', function () {
            //the whole point of the split. If this ever grows an `on` or an
            //`emit`, the transport has leaked back in.
            assert.equal(typeof appPackage.on, 'undefined');
            assert.equal(typeof appPackage.emit, 'undefined');
        });
    });

    register();
}
module.exports = plugin;
