//THE LOG, IN THE APP THAT HAS BEEN KEEPING ONE SINCE IT STARTED.
//
//What ./looks-like.js decides is checked in ./node.test.js, in this process, in
//a millisecond. This is about the log itself: that it survives, that a tagged
//logger tags, and that the two answers which look like "nothing happened" are
//told apart.
//
//NOTHING HERE CLEARS IT. `log.clear()` exists and this suite must not call it --
//it would empty the log of the app somebody is using, which is the one thing the
//plugin is for.

plugin.consumes = ['selftest', 'log', 'events'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var log = imports.log;

    describe('the app log', function () {

        it('takes a line and hands back what it kept', function () {
            var entry = log.add(['probe'], 'a line from the suite');

            assert.ok(entry.id > 0, 'no id');
            assert.equal(entry.text, 'a line from the suite');
            assert.ok(entry.tags.indexOf('probe') >= 0);
            assert.ok(entry.at > 0, 'no timestamp');
        });

        //A LOGGER WITH ITS TAGS ALREADY ON IT is the whole reason `on` exists:
        //untagged lines are what makes a filter useless, and they are what you
        //get when tagging is something to remember at every call site.
        it('a tagged logger puts its tags on every line', function () {
            var mine = log.on('probe', 'tagged');

            var one = mine.info('hello');
            assert.ok(one.tags.indexOf('probe') >= 0 && one.tags.indexOf('tagged') >= 0, one.tags.join(','));
            assert.equal(one.level, 'info');

            assert.equal(mine.warn('careful').level, 'warn');
            assert.equal(mine.bad('broken').level, 'bad');
            assert.equal(mine.good('fine').level, 'good');

            //and narrowing keeps what it already had
            var narrower = mine.on('deeper');
            var two = narrower.info('hello again');
            assert.ok(two.tags.indexOf('probe') >= 0 && two.tags.indexOf('deeper') >= 0, two.tags.join(','));
        });

        //A FORTY LINE STACK AS ONE ENTRY is one thing to scroll past; as forty
        //it is forty things to filter.
        it('command output arrives one line at a time', function () {
            var before = log.all().length;
            log.on('probe').out('one\ntwo\n\nthree\n');

            var added = log.all().slice(before);
            assert.equal(added.length, 3, 'blank lines were kept, or lines were not split');
            assert.equal(added[0].text, 'one');
            assert.equal(added[2].text, 'three');
            assert.equal(added[0].level, 'out');
        });

        //REDACTED ON THE WAY IN, not on the way out. Anything drawing this,
        //photographing it or handing it to the terminal would otherwise each
        //have to remember -- three places to be right instead of one.
        it('a credential never gets in, so it cannot get out', function () {
            var entry = log.add(['probe'], 'cloning with ghp_' + 'A'.repeat(36));

            assert.ok(entry.text.indexOf('ghp_') < 0, 'it kept the token: ' + entry.text);
            assert.ok(entry.text.indexOf('[redacted]') >= 0);

            //and it is not in what a reader would be handed either
            var seen = log.since(entry.id - 1).filter(function (e) { return e.id === entry.id; })[0];
            assert.ok(seen.text.indexOf('ghp_') < 0);
        });

        //IDS RESET WHEN THE LOG DOES, and a watcher that asks for everything
        //after an id from a previous life must be told "start again" rather than
        //"nothing" -- nothing looks exactly like a quiet system, for ever.
        it('an id from a log that no longer exists starts again', function () {
            log.add(['probe'], 'something to be newer than');

            var impossible = log.all()[log.all().length - 1].id + 1000;
            var out = log.since(impossible);

            assert.ok(out.length > 0, 'a stale id was answered with nothing, which looks like silence');
            assert.equal(out.length, log.all().length, 'it did not start again from the beginning');
        });

        it('since() is exclusive, so nobody sees a line twice', function () {
            var one = log.add(['probe'], 'first');
            var two = log.add(['probe'], 'second');

            var after = log.since(one.id);
            assert.ok(after.every(function (e) { return e.id > one.id; }), 'it re-sent the line it was given');
            assert.ok(after.some(function (e) { return e.id === two.id; }), 'it missed the next one');
        });

        it('lists its tags with how many carry each', function () {
            log.add(['probe', 'counted'], 'one');
            log.add(['probe', 'counted'], 'two');

            var found = log.tags().filter(function (t) { return t.tag === 'counted'; })[0];

            assert.ok(found, 'the tag is not listed: ' + log.tags().map(function (t) { return t.tag; }).join(','));
            assert.ok(found.n >= 2, 'counted ' + found.n);
        });

        //A WATCHER IS HOW ANYTHING DRAWS THIS LIVE, and one that throws must not
        //take the log down with it -- the log is what somebody is reading to find
        //out why the thing that threw is broken.
        it('tells its watchers, and survives one that throws', function () {
            var heard = [];
            var stopGood = log.subscribe(function (e) { heard.push(e.text); });
            var stopBad = log.subscribe(function () { throw new Error('a bad watcher'); });

            try {
                log.add(['probe'], 'watched');
                assert.ok(heard.indexOf('watched') >= 0, 'the good watcher heard nothing');
            } finally {
                stopGood();
                stopBad();
            }

            log.add(['probe'], 'after letting go');
            assert.equal(heard.indexOf('after letting go'), -1, 'it kept talking after unsubscribe');
        });

        //THE ONE SEAM A DURABLE RECORD MAY ARRIVE THROUGH, and ../events takes
        //it. This test borrows it for two lines and must hand it back to the
        //plugin that had it -- which is the whole reason `keeper` restores the
        //previous holder rather than clearing the slot.
        //
        //IT USED TO CLEAR IT, and this test was the caller: ../events stopped
        //recording the moment this ran, for the rest of the app's life. It
        //showed up as three of that plugin's own tests failing in a full run and
        //passing alone -- which reads as flakiness rather than as a suite that
        //switched a service off and walked away.
        it('hands the durable record seam over, and gives it back to whoever had it', function () {
            var kept = [];
            var stop = log.keeper(function (e) { kept.push(e.text); });

            try {
                log.add(['probe'], 'for the record');
                assert.ok(kept.indexOf('for the record') >= 0, 'the keeper was never called');
            } finally {
                stop();
            }

            log.add(['probe'], 'not for the record');
            assert.equal(kept.indexOf('not for the record'), -1, 'it kept keeping after being released');

            //AND THE REAL ONE IS BACK. Asking ../events whether it is still
            //recording is the only way to see this from here, and it is exactly
            //what was broken: a released slot that answers "nothing is keeping"
            //looks identical to an app that never had a record.
            assert.ok(imports.events.kept, 'events is present but no longer recording');

            var mine = 'probe seam handback ' + Date.now();
            log.on('app').info(mine);

            assert.ok(imports.events.all({ limit: 20 }).filter(function (e) {
                return e.text === mine;
            })[0], 'the seam was not handed back -- events is deaf');
        });
    });

    register();
}
module.exports = plugin;
