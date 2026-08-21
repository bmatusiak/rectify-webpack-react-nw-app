var http = require('http');

//the http server, from inside the process that owns it. Nothing here can be
//answered from a test file: the question is whether something is listening on
//the address it says it is, which needs it to be listening.

plugin.consumes = ['selftest', 'app', 'http'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { app, http: served } = imports;

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

    register();
}
module.exports = plugin;
