//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE ONE DOOR THE APP OPENS TO A MODEL ON PURPOSE, so the entries worth
//having are about what gets through it. A registry that offered a tool twice is
//untidy; a registry that ran a guarded one without asking is the hole the guard
//was added to close, and nothing on screen moves while it happens.

module.exports = [
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
        find: "                tools: listed(tools, ['run', 'needs']),",
        replace: "                tools: listed(tools, ['run']),"
    }
];
