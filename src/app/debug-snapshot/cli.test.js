var os = require('os');
var path = require('path');

//`node src/cli.js snapshot` is this plugin's terminal half, and it does one
//thing neither of the others can: it decides where the files go.
//
//THAT HAS TO HAPPEN HERE rather than in the app, because the app's working
//directory is wherever it was launched from and yours is wherever you are
//standing. A bare `bug` should land in front of you.
//
//NOTHING HERE TALKS TO THE REAL APP. `ipc.call` is stood in for, so these ask
//what the command SENT rather than what a window happened to look like -- and no
//test writes a picture of somebody's screen into their project.

plugin.consumes = ['selftest', 'cli', 'ipc'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { cli, ipc } = imports;

    var asked = null;
    var real = ipc.call;
    var answer = null;

    function intercept(said, fn) {
        answer = said;

        ipc.call = function (name, data) {
            asked = { name: name, data: data };
            return Promise.resolve(answer);
        };

        //THE VALUE COMES BACK OUT. Putting `ipc.call` back and returning nothing
        //made every test that reads what was PRINTED compare `undefined` against
        //a string -- four of them, all failing on the same line, which reads as
        //four broken behaviours rather than one broken helper.
        return Promise.resolve()
            .then(fn)
            .then(function (out) { ipc.call = real; return out; },
                function (e) { ipc.call = real; throw e; });
    }

    //WHAT THE COMMAND PRINTED, because half of what this file is for is saying
    //clearly what did and did not happen.
    function saying(fn) {
        var lines = [];
        var was = console.log;

        console.log = function () { lines.push([].slice.call(arguments).join(' ')); };

        return Promise.resolve().then(fn)
            .then(function () { console.log = was; return lines.join('\n'); },
                function (e) { console.log = was; throw e; });
    }

    describe('snapshot, from the terminal', function () {

        it('resolves a bare name against where you are, not where the app is', async function () {
            await intercept({ picture: 'a.png', markup: 'a.html', bytes: 10 }, async function () {
                await saying(function () { return cli.run(['snapshot', 'bug']); });
            });

            assert.equal(asked.name, 'snapshot');
            assert.equal(asked.data.path, path.resolve('bug'), asked.data.path);
        });

        //NO NAME IS NOT AN ERROR, and it must not become a path either. The app
        //picks a stamped name under `shots/` -- see ./main.js -- and this half
        //sending `{ path: undefined }` would look identical to it sending a name
        //while quietly meaning something else.
        it('asks for nothing at all when given no name', async function () {
            await intercept({ picture: 'a.png', markup: 'a.html', bytes: 10 }, async function () {
                await saying(function () { return cli.run(['snapshot']); });
            });

            assert.equal(asked.data.path, undefined, 'it invented a path for a name nobody gave');
        });

        //A SKIP IS NOT A SNAPSHOT, and printing it as one is how somebody ends
        //up looking at last week's picture.
        it('says nothing was written, rather than printing a path that is not there', async function () {
            var out = await intercept({ skipped: true, why: 'the window is minimized' }, function () {
                return saying(function () { return cli.run(['snapshot']); });
            });

            assert.ok(out.indexOf('nothing was written') >= 0, out);
            assert.ok(out.indexOf('minimized') > 0, out);
        });

        //HALF AN ANSWER SAYS WHICH HALF. A picture with no markup printed as a
        //bare path reads as a complete snapshot, and somebody concludes the
        //wrong thing from a pair that is not one.
        it('names the half that is missing', async function () {
            var out = await intercept({
                picture: 'a.png', markupSkipped: 'there is no page to read'
            }, function () {
                return saying(function () { return cli.run(['snapshot']); });
            });

            assert.ok(out.indexOf('a.png') >= 0, out);
            assert.ok(out.indexOf('no markup') > 0, out);
        });

        //SAID EVERY TIME, NOT ONCE IN A README. Both files hold whatever was on
        //the screen, and the markup's scrub only catches what has a shape.
        it('warns about what is in them, on every run', async function () {
            var out = await intercept({ picture: 'a.png', markup: 'a.html', bytes: 2048 }, function () {
                return saying(function () { return cli.run(['snapshot']); });
            });

            assert.ok(out.indexOf('before sharing') > 0, out);
        });

        it('takes an absolute path as given', async function () {
            var given = path.join(os.tmpdir(), 'probe-snapshot');

            await intercept({ picture: given + '.png', markup: given + '.html', bytes: 1 }, async function () {
                await saying(function () { return cli.run(['snapshot', given]); });
            });

            assert.equal(asked.data.path, given);
        });
    });

    describe('markup, from the terminal', function () {

        it('is still its own command, for the half that survives a hidden window', async function () {
            await intercept({ path: 'a.html', bytes: 4096 }, async function () {
                await saying(function () { return cli.run(['markup']); });
            });

            assert.equal(asked.name, 'markup');
        });

        it('says when something in it was redacted', async function () {
            var out = await intercept({ path: 'a.html', bytes: 4096, redacted: true }, function () {
                return saying(function () { return cli.run(['markup']); });
            });

            assert.ok(out.indexOf('redacted') > 0, out);
        });
    });

    register();
}
module.exports = plugin;
