//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS ONE FAILS BY BEING REASSURING, which nothing else in this feature does.
//`core/may` and `remote` fail shut -- a broken stance refuses, and somebody
//notices within the minute. A broken page here says a smaller number than the
//truth, or says "closed" over a build that is open, and there is no symptom at
//all: the person reads it, believes it, and ships.
//
//SO THE ENTRIES ARE ABOUT AGREEING WITH `core/may`, not about rendering. A page
//that draws nothing is a bug somebody sees. A page that draws the wrong thing
//confidently is the failure this file exists for.

//---- WHAT IS NOT BROKEN HERE, AND WHY --------------------------------------
//
//MOST OF THIS SCREEN ONLY SAYS ANYTHING IN A CLOSED BUILD, and every machine it
//is developed on runs an open one. The lists are empty of consequence, the
//region table is empty by design, and an entry broken on purpose would leave
//every check passing -- which ../../ui/theme/sabotage.js argues, and this file
//agrees, is worse than no entry: it teaches people to read past a red line.
//
//THE NUMBERS THEMSELVES ARE NOT THIS PLUGIN'S. Every one of them comes from
//`may.reach()`, so breaking them is a `core/may` entry and is already covered
//there by `core/may/node` -- asked both ways, in a millisecond, with no build.
//That is the whole reason this page re-derives nothing.
//
//WHAT IS LEFT IS THE WIRING, and one piece of it can fail on this machine: that
//the page is registered at all.
//
//AND ONE ENTRY WAS TAKEN OUT RATHER THAN KEPT. Pointing the region reader at
//`.is-guarded` instead of `.is-open` -- a page counting a mark the driver does
//not obey, which is this plugin's worst failure -- survived, and could not do
//anything else: in an open build there are no `.is-open` marks to miscount, so
//the wrong answer and the right one are both zero.
//
//IT IS COVERED IN `npm run drive -- --closed`, which puts real marks on the page
//and reads the region table back off it. An entry that cannot fail is worse than
//an absent one -- it teaches people to read past a red line.
//
//The rest is exercised by `npm run drive -- --package` and by the by-hand loop
//in ../../../CLAUDE.md.

module.exports = [
    {
        //REGISTERED, OR THE ONE SCREEN THAT SAYS WHAT A TOOL CAN REACH IS NOT
        //IN THE APP. Nothing else would go wrong -- the stance is still
        //enforced, every refusal still happens -- and the person simply has no
        //way to find out what is open except by reading two source files.
        what: 'the page is never registered, so nothing can be seen',
        file: 'window.js',
        check: 'ui/reachable/window',
        find: "        id: 'reachable',",
        replace: "        id: 'reachable-sabotaged',"
    }
];
