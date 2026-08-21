//appPackage is its own plugin per context because it used to be registered by
//io -- convenient in the window, where it arrives over the socket, and wrong,
//because it meant wanting the app's name made you consume a socket.
//
//in the page it is the one that really did come over the wire, so this is where
//"the cut held" can be checked against the thing that motivated it.

plugin.consumes = ['selftest', 'appPackage'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var appPackage = imports.appPackage;

    describe('appPackage, in the page', function () {

        it('arrived, despite this context having no way to read a file', function () {
            assert.ok(appPackage, 'nothing was handed over');
            assert.ok(appPackage.name, 'no name');
            assert.ok(appPackage.version, 'no version');
        });

        it('is the app this window belongs to', function () {
            //the title bar is set from it, so they have to agree
            assert.ok(document.title.indexOf(appPackage.title) === 0,
                'title is ' + document.title + ', app is ' + appPackage.title);
        });

        it('brought no socket with it', function () {
            //the whole point of the split: if this ever grows an `on` or an
            //`emit`, the transport has leaked back in
            assert.equal(typeof appPackage.on, 'undefined');
            assert.equal(typeof appPackage.emit, 'undefined');
        });
    });

    register();
}
module.exports = plugin;
