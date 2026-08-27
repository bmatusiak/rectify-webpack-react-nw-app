var http = require('http');

//the http server, from inside the process that owns it. Nothing here can be
//answered from a test file: the question is whether something is listening on
//the address it says it is, which needs it to be listening.

plugin.consumes = ['selftest', 'app', 'http', 'may', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, http: served, may, ipc } = imports;

    function fetch(url) {
        return new Promise(function (resolve, reject) {
            var request = http.get(url, function (response) {
                var body = '';
                response.setEncoding('utf8');
                response.on('data', function (c) { body += c; });
                response.on('end', function () { resolve({ status: response.statusCode, body: body }); });
            });
            request.on('error', reject);
            request.setTimeout(4000, function () { request.destroy(new Error('timed out')); });
        });
    }

    describe('http, in the running app', function () {

        it('is listening in a development build and says where', function () {
            if (app.isPackaged) return;//a package serves nothing; see below

            assert.ok(served.url, 'no url');
            assert.ok(/^http:\/\/[^/]+\/$/.test(served.url), served.url);
        });

        it('answers on the url it reported', async function () {
            if (app.isPackaged) return;

            var page = await fetch(served.url);
            assert.equal(page.status, 200);
            assert.ok(page.body.indexOf('<') >= 0, 'that is not a document');
        });

        it('picked a port nothing else was on', function () {
            if (app.isPackaged) return;

            //PORT is unset, so it asked for 0 and took whatever was free. Two
            //copies of this app can run side by side because of that.
            var port = Number(served.url.split(':')[2].replace('/', ''));
            assert.ok(port > 0 && port < 65536, 'port ' + port);
        });

        it('serves nothing at all when packaged, and offers no url to pretend otherwise', function () {
            if (!app.isPackaged) return;
            assert.equal(served.url, null);
        });
    });

    //---- opening a port is somebody's decision ----------------------------
    //
    //NOTHING TESTED THIS. `serve` is declared with ../may and the command asks
    //before turning the viewer on, and the only thing standing behind that was
    //the code reading correctly.
    //
    //EVERY PROBE ANSWERS `never` FIRST, which ../may returns without asking
    //anybody -- so no dialog is raised and none is left sitting over the app for
    //two minutes. It is taken back in a `finally`.
    describe('opening a port', function () {

        function refusing(fn) {
            var said = may.decide('serve', 'never', { window: true, trusted: true });
            if (said.refused) throw new Error(said.refused);

            return Promise.resolve().then(fn).then(
                function (out) { may.forget('serve', { window: true, trusted: true }); return out; },
                function (e) { may.forget('serve', { window: true, trusted: true }); throw e; });
        }

        it('is something the code says out loud', function () {
            assert.equal(may.asks('serve'), true, 'opening a port to the network is not guarded');
        });

        it('is refused over the wire when somebody said never', async function () {
            var was = served.serving;

            try {
                await refusing(async function () {
                    var out = await ipc.invoke('serve', { on: true }, { overTheWire: true });

                    assert.ok(out.refused, 'the control socket opened a port after being told never');
                    assert.equal(served.serving, false, 'it opened one anyway');
                });
            } finally { await served.setServing(was); }
        });

        //TURNING IT OFF NEEDS NOBODY'S PERMISSION. A refusal that stopped
        //somebody CLOSING a port would be a guard working against the thing it
        //is for -- and it is the one case where the safe-looking answer is the
        //dangerous one.
        it('is not asked about when it is being turned off', async function () {
            var was = served.serving;

            try {
                await served.setServing(true);

                await refusing(async function () {
                    var out = await ipc.invoke('serve', { on: false }, { overTheWire: true });

                    assert.ok(!out.refused, 'closing a port was refused: ' + out.refused);
                    assert.equal(served.serving, false, 'the port is still open');
                });
            } finally { await served.setServing(was); }
        });

        //THE GATE. With the viewer off nothing outside this window may reach the
        //app -- and it answers 503 rather than 404, because "off" and "not here"
        //are different facts and somebody reading a log deserves to know which.
        it('answers nothing but a 503 while the viewer is off', async function () {
            if (app.isPackaged || !served.url) return;
            var was = served.serving;

            try {
                await served.setServing(false);

                var out = await fetch(served.url + 'probe-http-gate');

                assert.equal(out.status, 503, 'it answered ' + out.status + ' with the viewer off');
                assert.ok(/viewer is off/.test(out.body), out.body);
            } finally { await served.setServing(was); }
        });

        //AND A PATH THAT REALLY IS A ROUTE, which is the case the gate exists
        //for and the one the test above cannot reach.
        //
        //`probe-http-gate` matches nothing, so it falls past the router either
        //way and lands on the 503 at the end -- meaning that check passed with
        //the gate removed entirely. Its own sabotage found that by surviving.
        //
        //IT IS NOT `/`. That is served in development with the viewer off, and
        //deliberately: webpack's middleware is mounted AFTER the gate because
        //the nw window still has to fetch its own bundle over http. What the
        //gate protects is the app's own routes, not the dev server -- and
        //measuring the difference is the only way to know which is which.
        //
        //SO IT PUTS ONE THERE. A route registered on `http.router` is exactly
        //what the gate stands in front of, and nothing else in the app has to
        //keep a path free for a test.
        it('will not serve a route of the app\'s own while the viewer is off', async function () {
            if (app.isPackaged || !served.url) return;
            var was = served.serving;

            served.router.get('/probe-http-route', function (req, res) {
                res.type('text').send('through the gate');
            });

            try {
                await served.setServing(false);
                var shut = await fetch(served.url + 'probe-http-route');

                assert.equal(shut.status, 503, 'an app route answered with the viewer off');
                assert.ok(!/through the gate/.test(shut.body), shut.body);

                //AND THE ROUTE REALLY IS THERE, or the check above would pass on
                //a path that never existed -- which is the same blank pass the
                //test before it was giving.
                await served.setServing(true);
                var open = await fetch(served.url + 'probe-http-route');

                assert.equal(open.status, 200, 'the probe route is not registered at all');
                assert.ok(/through the gate/.test(open.body), open.body);
            } finally {
                //TAKEN OFF AGAIN. Express has no `remove`, and the layer this
                //added is the last one on the stack -- leaving it would put a
                //test's route in the app somebody is using.
                served.router.stack.pop();
                await served.setServing(was);
            }
        });
    });

    register();
}
module.exports = plugin;
