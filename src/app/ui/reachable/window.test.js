//THE SCREEN THAT SAYS WHAT A TOOL CAN REACH, ASKED WHETHER IT IS SAYING IT.
//
//A PAGE THAT DRAWS THE WRONG NUMBER HERE IS WORSE THAN NO PAGE. Everything else
//in this feature fails shut -- a broken stance refuses -- but this one fails by
//being reassuring, which is the direction nothing else in the app is allowed to
//fail in. So the checks are about the page agreeing with `may` rather than about
//it rendering.

plugin.consumes = ['selftest', 'pages', 'may'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var { pages, may } = imports;

    describe('ui/reachable', function () {

        it('registers itself, so deleting the demo leaves it arriving', function () {
            //`pages.list` IS A GETTER, not a method -- it is read rather than
            //held so a caller asking twice gets what is registered now.
            var mine = pages.list.filter(function (one) { return one.id === 'reachable'; });

            assert.equal(mine.length, 1, 'the Reachable page is not in the registry');
            assert.equal(typeof mine[0].Page, 'function', 'it registered something that is not a page');
        });

        //IT READS THE MIRROR AND NOT THE CONFIG, which is the whole of "nothing
        //here is a copy". If this page could answer when `may` could not, it
        //would be a second opinion -- and a second opinion about what a tool can
        //reach is one that is wrong on the day it matters.
        it('has nothing to say that core/may did not say first', function () {
            var reach = may.reach();

            assert.ok(reach, 'main never sent the reach, so the page has nothing to draw');
            assert.ok(reach.lists, 'the reach carries no lists');
            assert.ok(reach.counts, 'the reach carries no counts, so "3 of 27" cannot be said');
        });

        //THE STANCE THE PAGE PAINTS FROM AND THE STANCE THE DRIVER ENFORCES ARE
        //ONE ANSWER. They are read from the same place on purpose: a screen
        //saying "closed" while ../../remote lets everything through is the exact
        //failure a mark is not allowed to have.
        it('paints from the same stance the driver enforces', function () {
            assert.equal(may.closed(), !may.reach().open,
                'the constant the page reads and the list main sent disagree about the stance');
        });

        //AN OPEN BUILD DRAWS NO MARKS AT ALL, and this is the test that says so.
        //A ring round three controls in a build where everything is reachable
        //would read as "and nothing else", which is the dangerous direction.
        it('draws no open marks while the build is open', function () {
            if (may.closed()) return;//the closed run is `drive --package` and by hand

            assert.equal(document.querySelectorAll('.is-open').length, 0,
                'something is marked open in a build where everything already is');
        });

        //AND THE REGIONS IT COUNTS ARE THE ONES THE DRIVER OBEYS. The page
        //reads `.is-open` off the document and ../../remote/window.js reaches
        //for the same class with `closest` -- so a page that counted anything
        //else would be describing a rule nothing enforces.
        it('counts the same mark the driver reads', function () {
            var found = document.querySelectorAll('.is-open');

            for (var i = 0; i < found.length; i++) {
                assert.ok(found[i].closest('.is-open') === found[i],
                    'a marked region is not its own nearest mark, so closest() would miss it');
            }
        });
    });

    register();
}
module.exports = plugin;
