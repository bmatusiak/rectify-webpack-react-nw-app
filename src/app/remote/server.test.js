var harness = require('@bmatusiak/rectify/harness.js');

//remote is the middle of click/fill/read: a command off the control socket,
//out over the socket.io connection, into whichever view is the app.
//
//"whichever" is the part with a decision in it. There can be more than one --
//open in browser makes a second, and it is a real client of the same server --
//so this half has to choose, and say which one it chose.

var { describe, it, assert } = harness;

plugin.consumes = ['app', 'io'];
plugin.provides = [];
function plugin(imports, register) {
    var host = imports.app.host;

    function ask(name, data) { return host.ipc.invoke(name, data); }

    //a view that answers a click the way the window half does
    function view(id, isApp) {
        var socket = host.fakeSocket(id);
        host.io.connect(socket);
        socket.say('remote:hello', { app: isApp, title: id });
        return socket;
    }

    //choosing a view is asynchronous -- it may go and ask who is out there
    //first -- so nothing has been sent to anybody on the tick the call starts.
    //Reading it too early left a promise that rejected five seconds later with
    //nobody waiting on it, which took the whole file down rather than one test.
    function sent() { return new Promise(function (r) { setTimeout(r, 30); }); }

    describe('remote, server side', function () {

        it('offers the three verbs and a way to list what is out there', function () {
            ['click', 'fill', 'read', 'views'].forEach(function (name) {
                assert.ok(host.ipc.commands().indexOf(name) >= 0, name + ' is not registered');
            });
        });

        it('says so when nothing is connected, rather than waiting', async function () {
            var complaint = null;
            try { await ask('click', { selector: 'anything' }); }
            catch (e) { complaint = e.message; }

            assert.ok(complaint, 'it should have refused');
            assert.ok(complaint.indexOf('no view') >= 0, complaint);
        });

        it('sends the click to the view and hands back what it answered', async function () {
            var page = view('probe-window', true);

            var answering = ask('click', { selector: 'Save' });
            await sent();

            //the page answering, which is what the window half does
            var asked = page.lastSent('remote:click');
            assert.ok(asked, 'nothing was sent to the view');
            assert.equal(asked.data.selector, 'Save');
            asked.ack({ found: 'selector', clicked: { element: 'button', text: 'Save' } });

            var out = await answering;
            assert.equal(out.clicked.text, 'Save');
            assert.equal(out.view, 'window');

            page.disconnect();
        });

        it('turns an error from the view into an error, not a result', async function () {
            var page = view('probe-error', true);
            var answering = ask('click', { selector: 'nothing' });
            await sent();

            page.lastSent('remote:click').ack({ error: 'nothing matches "nothing"' });

            var complaint = null;
            try { await answering; } catch (e) { complaint = e.message; }

            assert.ok(complaint && complaint.indexOf('nothing matches') >= 0, complaint);
            page.disconnect();
        });

        it('prefers the app window over a browser looking at the same page', async function () {
            var browser = view('probe-browser', false);
            var window_ = view('probe-app', true);

            var answering = ask('click', { selector: 'Save' });
            await sent();

            assert.ok(!browser.lastSent('remote:click'), 'the browser was asked');
            var asked = window_.lastSent('remote:click');
            assert.ok(asked, 'the window was not asked');

            asked.ack({ clicked: { element: 'button', text: 'Save' } });

            var out = await answering;
            assert.equal(out.view, 'window');
            assert.equal(out.views, 2, 'it should say there was a choice to make');

            browser.disconnect();
            window_.disconnect();
        });

        it('forgets a view that goes away', async function () {
            var page = view('probe-leaving', true);
            page.disconnect();

            var complaint = null;
            try { await ask('click', { selector: 'Save' }); }
            catch (e) { complaint = e.message; }

            assert.ok(complaint && complaint.indexOf('no view') >= 0, complaint);
        });
    });

    register();
}
module.exports = plugin;
