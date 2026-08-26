//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//ALL OF THESE ARE ABOUT `markup`, which is the newest thing here and the one
//whose failures are quiet. A picture that does not arrive is obvious. A page
//that arrives with a credential in it looks exactly like a page.
//
//THEY RESTART THE APP, because main.js is read off disk by the boot and never
//again -- see ../../../../tools/sabotage.js.

module.exports = [
    {
        //THE ONE THAT MATTERS. This writes a copy of the screen to a file that
        //gets attached to bug reports, and the scrub is the only thing standing
        //between it and whatever the page was showing. The app this came from
        //does not scrub at all, and its own header says what saves it is a
        //property of React rather than a decision anybody made.
        what: 'the markup stops being scrubbed on the way out',
        file: 'main.js',
        check: 'core/window/main',
        restart: true,
        find: "        return looksLike.redact(page, 'durable');",
        replace: '        return page;'
    },
    {
        //THE NARROW RULES ARE THE LOG'S and are not enough for something kept:
        //they leave anything long and random alone, which is most of what a
        //token looks like when nothing has labelled it.
        what: 'it is scrubbed with the log rules rather than the durable ones',
        file: 'main.js',
        check: 'core/window/main',
        restart: true,
        find: "return looksLike.redact(page, 'durable');",
        replace: 'return looksLike.redact(page);'
    },
    {
        what: 'it reads nothing, and says nothing about having read nothing',
        file: 'main.js',
        check: 'core/window/main',
        restart: true,
        find: '        var page = bridge.markup();\n        if (!page) return null;',
        replace: "        var page = '<html></html>';\n        if (!page) return null;"
    }
];
