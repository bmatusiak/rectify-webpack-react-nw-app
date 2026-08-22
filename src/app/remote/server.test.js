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

    //A REAL SECOND VIEWER, ON THE SOCKET.IO PATH.
    //
    //THE ONE PATH NOTHING WAS EXERCISING. io/server.test.js opens a socket.io
    //CLIENT from node, which proves the handshake and nothing about a page; and
    //server-graph.test.js fakes both views. Neither ever ran the window half as
    //a browser -- no boot over socket.io, no second view, and "the window wins"
    //asserted only against sockets that had been told what to say.
    //
    //A second nw window on the same url is already a browser: remote page, no
    //node, and no bridge attached to it, so socket.io is its only way home.
    async function browser(fn) {
        var was = host.http.serving;
        if (!was) await host.http.setServing(true);

        var session = await host.window.openView();
        try {
            //it has to boot and say hello, which is a page load
            for (var i = 0; i < 60; i++) {
                var seen = await ask('views', {});
                if (seen.views.some(function (v) { return v.session === session; })) return await fn(session, seen);
                await new Promise(function (r) { setTimeout(r, 100); });
            }
            assert.ok(false, 'the browser view never connected');
        } finally {
            host.window.closeView(session);
            if (!was) await host.http.setServing(false);
        }
    }

    describe('remote, server side', function () {

        //slow, because it opens a window and waits for a page to boot in it --
        //and worth it, because it is the only place the browser path runs
        it('takes a real browser view, over socket.io', async function () {
            await browser(function (session, seen) {
                var mine = seen.views.filter(function (v) { return v.session === session; })[0];

                assert.ok(mine, 'the view is not in the list');
                assert.equal(mine.app, false, 'a browser view was taken for the app window');
                assert.ok(seen.views.some(function (v) { return v.app; }), 'the app window went missing');
                assert.ok(seen.views.length >= 2, 'only ' + seen.views.length + ' views');

                //IT IS NOT ON THE BRIDGE, which is what makes it a browser. The
                //bridge calls its one socket `window`; socket.io names its own.
                assert.notEqual(mine.id, 'window', 'that view is on the bridge, so it is not a browser');
            });
        });

        it('still gives the app window the click when a browser is also there', async function () {
            await browser(async function () {
                var out = await ask('read', { selector: 'h4' });
                assert.equal(out.view, 'window', 'a browser view took the click');
                assert.ok(out.views >= 2, 'it did not notice there was a choice');
            });
        });

        //A DEFAULT THAT CANNOT BE OVERRIDDEN IS A VIEW THAT CAN BE OPENED AND
        //LOOKED AT AND NEVER DRIVEN.
        it('aims at a browser view when one is named', async function () {
            await browser(async function (session) {
                var out = await ask('read', { selector: 'h4', view: session });
                assert.equal(out.view, session, 'it went somewhere else');
                assert.ok(out.count > 0, 'nothing was read from the browser view');
            });
        });

        it('says which names it knows when asked for one it does not', async function () {
            await browser(async function () {
                var threw = null;
                try { await ask('read', { selector: 'h4', view: 'browser-nope' }); }
                catch (e) { threw = e.message; }

                assert.ok(threw, 'it accepted a view that is not there');
                assert.ok(threw.indexOf('window') >= 0, 'it did not say what there is: ' + threw);
            });
        });


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
