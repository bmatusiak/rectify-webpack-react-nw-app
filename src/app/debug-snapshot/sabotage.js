//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//TWO KINDS OF FAILURE HERE, AND THEY ARE NOT EQUALLY BAD. Writing half a pair,
//or writing nothing, costs somebody a second attempt. Writing the screen down
//when nobody agreed to it cannot be taken back -- the file is on disk, in
//cleartext, in a working tree somebody is about to share.
//
//So the guard entries are the ones that matter, and they are broken from both
//ends: the command that should ask, and the page that should say honestly whether
//a person pressed the key.

module.exports = [
    //---- the guard ---------------------------------------------------------
    {
        //THE WHOLE PLUGIN, UNGUARDED. Anything that can reach the control socket
        //could then copy the screen to a file and read it back.
        what: 'the screen is written down without anybody being asked',
        file: 'main.js',
        check: 'debug-snapshot/main',
        restart: true,
        find: '        var said = await may(\'snapshot\', { from: from });\n        if (!said.allowed) return { skipped: true, why: said.why };\n\n        var name =',
        replace: '        var name ='
    },
    {
        //THE PAGE'S HALF OF THE SAME SENTENCE. Main is only as good as what the
        //window tells it about the press, so a page that always said "a person
        //did this" would undo the rule from the other end -- and every driven
        //ctrl+shift+D would go straight through.
        what: 'the page says a person pressed the key however it was pressed',
        file: 'window.js',
        check: 'debug-snapshot/window',
        restart: true,
        find: '        io.emit(\'snapshot:take\', { trusted: !!trusted }, function (out) {',
        replace: '        io.emit(\'snapshot:take\', { trusted: true }, function (out) {'
    },
    {
        //THE KEY STOPS BEING A KEY. Firing on every `d` would take a snapshot
        //every time somebody typed into a field -- which still "works", and is
        //how it would go unnoticed.
        what: 'any keypress with a d in it asks for a snapshot',
        file: 'window.js',
        check: 'debug-snapshot/window',
        restart: true,
        find: '        if (!e.ctrlKey || !e.shiftKey) return;',
        replace: '        if (false) return;'
    },

    //---- the pair ----------------------------------------------------------
    {
        //THE ONE THING THIS PLUGIN ADDS THAT NEITHER HALF HAD ALONE. Two files
        //that do not share a name are two files somebody pairs up by timestamp,
        //at the point they are already comparing two things.
        what: 'the two halves stop sharing a name',
        file: 'main.js',
        check: 'debug-snapshot/main',
        restart: true,
        find: "        var shot = await picture(name + '.png');",
        replace: "        var shot = await picture(name + '-picture.png');"
    },
    {
        //A MISSING HALF GOES QUIET. Silence here lets a broken camera look
        //exactly like a minimized window, for ever.
        what: 'a half that was not written is dropped rather than named',
        file: 'main.js',
        check: 'debug-snapshot/main',
        restart: true,
        find: '        if (shot.skipped) out.pictureSkipped = shot.why;',
        replace: '        if (shot.skipped) { /* sabotaged */ }'
    },

    //---- and the terminal --------------------------------------------------
    {
        //THE PATH IS RESOLVED WHERE YOU ARE STANDING. Without this a bare name
        //lands wherever the app was launched from, which is a folder somebody
        //opened weeks ago.
        what: 'a bare name is left for the app to resolve against its own folder',
        file: 'cli.js',
        check: 'debug-snapshot/cli',
        find: '                data.name ? { path: path.resolve(data.name) } : {}, 120000);',
        replace: '                data.name ? { path: data.name } : {}, 120000);'
    },
    {
        //A SKIP PRINTED AS A SNAPSHOT. This is how somebody ends up looking at
        //last week's picture and drawing conclusions from it.
        what: 'nothing was written, and the terminal prints paths anyway',
        file: 'cli.js',
        check: 'debug-snapshot/cli',
        find: "            if (out.skipped) return console.log('nothing was written: ' + out.why);",
        replace: '            //sabotaged'
    },
    {
        //SAID EVERY RUN, NOT ONCE IN A README. Both files hold whatever was on
        //the screen and the scrub only catches what has a shape.
        what: 'the warning about what is in the files stops being printed',
        file: 'cli.js',
        check: 'debug-snapshot/cli',
        find: "            console.log('  they hold whatever was on the screen; look before sharing them');",
        replace: '            //sabotaged'
    }
];
