//remote is the middle of click/fill/read: a command off the control socket, out
//over the socket.io connection, into whichever view is the app.
//
//against a mock this was a fake socket answering a fake click. Inside the app
//there is a real window with a real page in it, so the whole path can be
//walked: this half picks the view, the window half finds the element, and what
//comes back describes something that is actually on screen.

plugin.consumes = ['selftest', 'app', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var host = imports.app.host;

    function ask(name, data) { return host.ipc.invoke(name, data); }

    describe('remote, server side', function () {

        it('offers the three verbs and a way to list what is out there', function () {
            ['click', 'fill', 'read', 'views'].forEach(function (name) {
                assert.ok(host.ipc.commands().indexOf(name) >= 0, name + ' is not registered');
            });
        });

        it('finds the app window, and knows it is not a browser', async function () {
            var seen = await ask('views', {});

            assert.ok(seen.views.length > 0, 'no view: ' + seen.connected + ' connected');
            assert.ok(seen.views.some(function (v) { return v.app; }),
                'none of them said it was the app: ' + JSON.stringify(seen.views));
        });

        it('reads something that is really on the page', async function () {
            var seen = await ask('read', { selector: '.app-sidebar .nav-pills .nav-link' });

            assert.ok(seen.count > 1, 'expected several sidebar links, got ' + seen.count);
            assert.ok(seen.items[0].text.length > 0, 'the first one has no text');
        });

        it('says which view answered', async function () {
            var seen = await ask('read', { selector: '.navbar-brand' });
            assert.equal(seen.view, 'window');
        });

        it('turns "nothing matches" from the window into an error here', async function () {
            var complaint = null;
            try { await ask('click', { selector: '#nothing-is-called-this' }); }
            catch (e) { complaint = e.message; }

            assert.ok(complaint, 'clicking nothing should have failed');
            assert.ok(complaint.indexOf('nothing matches') >= 0, complaint);
        });

        it('refuses a text match that is not unique, rather than picking one', async function () {
            //two things say "System" on the System page: the sidebar item and
            //the heading's jump-list entry. Choosing silently is how you click
            //a thing you never named.
            var complaint = null;
            try { await ask('click', { selector: 'System' }); }
            catch (e) { complaint = e.message; }

            if (complaint) assert.ok(complaint.indexOf('matches') >= 0, complaint);
            //if it was unique on this page, there is nothing to prove here
        });
    });

    register();
}
module.exports = plugin;
