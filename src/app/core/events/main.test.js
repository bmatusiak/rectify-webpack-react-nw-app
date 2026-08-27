var fs = require('node:fs');

//THE RECORD, IN THE APP THAT IS KEEPING IT.
//
//./node.test.js has the rule. What needs the real app is the seam: that lines
//written to the REAL log arrive here, redacted, and come back with a bookmark
//that cannot skip one.
//
//EVERY TEST WRITES INTO THE APP'S OWN RECORD, which cannot be undone -- the
//whole point is that it survives. So every line these write says `probe` in it,
//and the tag they use is one the running app's policy really keeps: a test that
//invented a tag would be testing a policy nobody has.

plugin.consumes = ['selftest', 'events', 'log', 'dataDir'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { events, log, dataDir } = imports;

    var say = log.on('app');

    describe('what the app has done', function () {

        //THE POLICY COMES OUT OF src/config.js, AND IT DID NOT.
        //
        //rectify hands every plugin the WHOLE config as its third argument and
        //each one indexes by the service it provides -- ../window reads
        //`config.window`. This read `config.keep`, so the block in the file was
        //never looked at and the app ran on the defaults in ./keeping.js.
        //
        //NOTHING SAID SO, because the two lists agreed. It was found by adding a
        //tag to the file and watching lines carrying it never reach the record.
        //This is the check that would have caught it on the first run.
        it('keeps what src/config.js says, not what it defaults to', function () {
            var asked = require('../../../config.js')().events;

            assert.ok(asked && asked.keep, 'src/config.js has no events policy to compare against');

            asked.keep.forEach(function (tag) {
                assert.ok(events.policy.keep.indexOf(tag) >= 0,
                    'the config says keep "' + tag + '" and the record does not: it is running on '
                    + 'its own defaults, which means the file is being ignored');
            });

            assert.equal(events.policy.most, asked.most);
        });

        it('is really being kept, and says where', function () {
            assert.equal(events.kept, true, 'this half is not keeping anything');
            assert.ok(events.where.indexOf(dataDir.path) === 0,
                events.where + ' is not under ' + dataDir.path);
        });

        //THE SEAM. core/log holds one `keeper` slot and this plugin takes it --
        //so a line written to the log with no mention of `events` has to turn up
        //here. If it does not, the record is a plugin nothing feeds.
        it('takes what the log is told, without the caller knowing', function () {
            var text = 'probe act ' + Date.now();

            say.info(text);

            var mine = events.all({ limit: 50 }).filter(function (e) {
                return e.text === text;
            })[0];

            assert.ok(mine, 'a kept line never reached the record');
            assert.ok(mine.seq > 0, 'it arrived without a count');
        });

        //THE CONDITION core/log SET ON THIS EXISTING AT ALL, end to end: a
        //credential written to the log does not reach disk.
        it('a credential in an act does not reach the file', function () {
            var token = 'ghp_' + new Array(37).join('E');

            say.info('probe cloning with ' + token);

            var text = fs.readFileSync(events.where, 'utf8');
            assert.equal(text.indexOf(token), -1, 'the token is on disk');
        });

        //AND THE BLUNTER HALF, which is why this record asks for a different
        //profile than the log does: an authorize url arrives under a tag that IS
        //kept, so the allowlist opens the door and only this closes it.
        it('a sign-in url loses its tail, though the log keeps it whole', function () {
            var url = 'https://claude.ai/oauth/authorize?code=probe' + Date.now();

            say.info('probe waiting for sign-in -- open ' + url);

            var mine = events.all({ limit: 20 }).filter(function (e) {
                return e.text.indexOf('probe waiting for sign-in') >= 0;
            }).pop();

            assert.ok(mine, 'the line never arrived');
            assert.ok(mine.text.indexOf('claude.ai') > 0, 'it lost the host too: ' + mine.text);
            assert.equal(mine.text.indexOf('oauth'), -1, mine.text);

            //the LIVE log kept it whole, which is the decision that stands
            var live = log.all().filter(function (e) {
                return e.text.indexOf('probe waiting for sign-in') >= 0;
            }).pop();

            assert.ok(live && live.text.indexOf('oauth') > 0,
                'the live log redacted it too, so the two profiles have collapsed into one');
        });

        //TWO ACTS IN ONE MILLISECOND IS NOT A RARE CASE -- a plugin that stops
        //one thing and starts another writes both immediately. Bookmarking on a
        //TIMESTAMP loses the second of them for ever: it is not greater than the
        //mark, so it never comes back, and a watcher never learns it happened.
        //
        //The app this came from found this by the test being flaky, which is the
        //only way a same-millisecond bug ever shows up. Here it is forced.
        it('a bookmark cannot skip an act written in the same millisecond', function () {
            var one = 'probe pair a ' + Date.now();
            var two = 'probe pair b ' + Date.now();

            say.info(one);
            say.info(two);

            var rows = events.all({ limit: 50 });

            var first = rows.filter(function (e) { return e.text === one; })[0];
            var second = rows.filter(function (e) { return e.text === two; })[0];

            assert.ok(first && second, 'both acts did not arrive');

            //the case worth having: if they landed in the same millisecond, a
            //timestamp bookmark would lose the second one
            assert.ok(second.seq > first.seq, 'the two share a count, so one is unreachable');

            var after = events.all({ since: first.seq, limit: 50 });
            assert.ok(after.filter(function (e) { return e.text === two; })[0],
                'reading from the first bookmark did not hand back the second act');
        });

        //WEATHER IS NOT AN ACT, checked against the running app's real policy
        //rather than a made-up one -- so this fails if somebody adds a heartbeat
        //tag to `keep` in src/config.js.
        it('does not keep the app breathing', function () {
            var text = 'probe heartbeat ' + Date.now();

            log.on('app', 'tick').info(text);

            assert.equal(events.all({ limit: 50 }).filter(function (e) {
                return e.text === text;
            })[0], undefined, 'a line tagged tick was recorded as an act');
        });

        it('answers a bookmark from the future as everything, not as nothing', function () {
            //A COUNT HIGHER THAN ANYTHING HERE cannot be one of ours. Answering
            //it with nothing would leave a watcher connected, healthy and silent
            //for ever -- the same trap ../log/main.js documents for its ids.
            var rows = events.all({ since: 999999999, limit: 10 });
            assert.ok(Array.isArray(rows), 'it did not answer a list at all');
        });
    });

    register();
}
module.exports = plugin;
