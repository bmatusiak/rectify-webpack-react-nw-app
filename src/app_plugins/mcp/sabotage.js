//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE ONE DOOR THE APP OPENS TO A MODEL ON PURPOSE, so the entries worth
//having are about what gets through it. A registry that offered a tool twice is
//untidy; a registry that ran a guarded one without asking is the hole the guard
//was added to close, and nothing on screen moves while it happens.

module.exports = [
    //---- and what a closed build will not admit to having ------------------
    //
    //`needs` IS WHO MAY AND THIS IS WHETHER IT EXISTS HERE AT ALL. The entries
    //below the divider are about a tool that runs when it should have asked;
    //these are about one a closed build was never supposed to offer.
    //
    //THEY GO TO ./node.test.js, and that is the finding rather than a
    //convenience. Hiding only happens in a CLOSED build and every machine this
    //is worked on runs an open one -- as a closure inside ./server.js the whole
    //rule could be broken with `mcp/server` still green, because that suite has
    //no way to be a closed build. ./showing.js takes the predicate as an
    //argument, so the closed answer is one line away with no app at all.
    {
        //THE FILTER ITSELF. Without it a closed build lists every tool it has
        //and the whole surface is back -- `tools/call` would still refuse, but
        //a model cannot be tempted by what it was never shown, and being shown
        //is most of how it gets tempted.
        what: 'a closed build lists every tool it has anyway',
        file: 'showing.js',
        check: 'mcp/node',
        find: '    return names.filter(function (name) { return !isHidden || !isHidden(name); });',
        replace: '    return names;'
    },
    {
        //LISTING AND CALLING HAVE TO AGREE, and this is the half that makes
        //`tools/list` mean anything. Hand `listed` the whole registry and the
        //list goes back to naming what the caller may not have.
        what: 'the listing is built before the hiding rather than after it',
        file: 'showing.js',
        check: 'mcp/node',
        find: '    return module.exports.shown(map, isHidden).sort().map(function (key) {',
        replace: '    return Object.keys(map || {}).sort().map(function (key) {'
    },
    {
        //TEMPLATES ARE AN ARRAY CARRYING THEIR OWN NAMES and everything else is
        //a map keyed by them. Read one shape only and `app://readme/{plugin}` --
        //which reads a file off disk by name -- is never hidden by anything.
        what: 'resource templates are not read the way they are stored, so they never hide',
        file: 'showing.js',
        check: 'mcp/node',
        find: '        ? map.map(function (one) { return one && one.name; })',
        replace: '        ? []'
    },
    {
        //OUR OWN FIELDS MUST NOT REACH THE WIRE. `needs` is a map of what is
        //guarded, handed to the one caller it is guarded against -- and it is
        //not a field the protocol has, so a client that validates would reject
        //the lot.
        what: 'the implementation and what guards it go out with the listing',
        file: 'showing.js',
        check: 'mcp/node',
        find: '        (drop || []).forEach(function (field) { delete copy[field]; });',
        replace: '        //sabotaged'
    },

    //---- and who may run one -----------------------------------------------

    {
        //THE WHOLE POINT. Without the gate, a picture of the screen, the text on
        //it and the app's own log all go to whatever connected, unasked -- which
        //is exactly the state this plugin was in before the field existed.
        what: 'a guarded tool runs without anybody being asked',
        file: 'server.js',
        check: 'mcp/server',
        find: '            var no = await allowed(found.needs, from);\n            if (no) return { result: { content: [{ type: \'text\', text: no }], isError: true } };',
        replace: '            //sabotaged'
    },
    {
        //A RESOURCE IS READ RATHER THAN RUN, AND THAT IS NOT SAFER. What comes
        //back goes to the model exactly as a tool's answer does.
        what: 'a guarded resource is read without anybody being asked',
        file: 'server.js',
        check: 'mcp/server',
        find: '            var no = await allowed(found.needs, from);\n            if (no) return { refused: no };',
        replace: '            //sabotaged'
    },
    {
        //`needs` ALONE HAS TO BE ENOUGH. A tool naming a capability nobody
        //declared is silently ungoverned -- ../../app/core/may allows what
        //nothing guards -- so a field whose entire purpose is to say "ask about
        //this" would quietly mean the opposite.
        what: 'wanting a guard does not get you one',
        file: 'server.js',
        check: 'mcp/server',
        find: '        if (!needs || may.asks(needs)) return function () { };',
        replace: '        return function () { };'
    },
    {
        //THE ANSWER STOPS BEING CONSULTED. `allowed` returning null means "go
        //ahead", so this is the version where the question is asked, a person
        //says no, and it happens anyway -- worse than not asking, because
        //somebody watched themselves refuse it.
        what: 'the person is asked and the answer is ignored',
        file: 'server.js',
        check: 'mcp/server',
        find: '        if (said.allowed) return null;',
        replace: '        return null;'
    },
    {
        //SAID WHERE A MODEL READS. Without it a guarded tool looks like any
        //other, gets called, waits while somebody is asked, and may come back
        //refused -- which is indistinguishable from a broken tool.
        what: 'a guarded tool no longer says it will ask',
        file: 'server.js',
        check: 'mcp/server',
        find: "        return (text ? text + ' ' : '') + 'A person at the window is asked before this ' + doing + '.';",
        replace: '        return text || \'\';'
    },
    {
        //AND `needs` GOING ON THE WIRE. It is not a field MCP has, and a client
        //that validates what it is sent would be right to reject the listing --
        //which would take every tool with it, guarded or not.
        what: 'a field the protocol does not have is sent to the client',
        file: 'server.js',
        check: 'mcp/server',
        find: "                tools: listed(tools, ['run', 'needs'], 'tools'),",
        replace: "                tools: listed(tools, ['run'], 'tools'),"
    }
];
