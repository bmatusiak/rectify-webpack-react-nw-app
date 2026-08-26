//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THE FIRST THREE ARE THE ONES THAT MATTER, and they are about a name arriving
//from somewhere else. Everything else here loses a file; those write one
//wherever the sender chose.
//
//NEARLY ALL GO TO ./node.test.js -- the rules are about text and bytes, and need
//no app. The two that need the real folder restart it, because `main.js` is read
//off disk by the boot and never again.

module.exports = [
    //---- a name that arrives with the bytes --------------------------------
    {
        what: 'a name with a path in it is sanitised instead of refused',
        file: 'filing.js',
        check: 'core/archive/node',
        find: '    if (!NAME.test(n)) {',
        replace: "    if (false) { n = n.replace(/[^A-Za-z0-9._-]/g, '');"
    },
    {
        what: 'the allow list becomes a deny list, so anything not named is allowed',
        file: 'filing.js',
        check: 'core/archive/node',
        find: 'var NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;',
        replace: 'var NAME = /^(?!.*\\u0000).*$/;'
    },
    {
        what: 'a refusal is a boolean, so nothing can say why',
        file: 'filing.js',
        check: 'core/archive/node',
        find: "            + 'with a letter or a number -- no directories, and no path of any kind';",
        replace: "            + 'no';"
    },

    //---- and what comes back out -------------------------------------------
    {
        //RENDERING A BINARY AS TEXT produces a screen of replacement characters,
        //which reads as corruption rather than as "this is not text".
        what: 'a binary is handed back as text',
        file: 'filing.js',
        check: 'core/archive/node',
        find: '    for (var i = 0; i < look; i++) if (bytes[i] === 0) return false;',
        replace: '    for (var i = 0; i < look; i++) if (false) return false;'
    },
    {
        what: 'a tar with headers this cannot read is half read and called a listing',
        file: 'tar.js',
        check: 'core/archive/node',
        find: "        if (kind === 'x' || kind === 'g') {",
        replace: '        if (false) {'
    },
    {
        what: 'a gzipped file is read as though it were a tar',
        file: 'tar.js',
        check: 'core/archive/node',
        find: '    if (looksGzipped(bytes)) {',
        replace: '    if (false) {'
    },
    {
        //A SIZE FIELD IS OCTAL, IN ASCII, which is the one thing about tar that
        //surprises everybody -- read as decimal, every offset after the first
        //entry is wrong and the listing is fiction.
        what: 'a size is read as decimal, so every entry after the first is wrong',
        file: 'tar.js',
        check: 'core/archive/node',
        find: '    var n = parseInt(said, 8);',
        replace: '    var n = parseInt(said, 10);'
    },
    {
        what: 'the prefix is dropped, so a long path comes back as its last part',
        file: 'tar.js',
        check: 'core/archive/node',
        find: "            name: prefix ? prefix + '/' + name : name,",
        replace: '            name: name,'
    },
    {
        //A TAR IS A WHOLE NUMBER OF 512-BYTE BLOCKS. Without that, anything with
        //`ustar` at offset 257 by accident is read as an archive.
        what: 'anything with the magic in the right place is taken for a tar',
        file: 'tar.js',
        check: 'core/archive/node',
        find: '    if (!bytes || bytes.length < BLOCK || (bytes.length % BLOCK) !== 0) return false;',
        replace: '    if (!bytes || bytes.length < BLOCK) return false;'
    },

    //---- and the folder itself ---------------------------------------------
    {
        what: 'the namespaced drawer falls through to the one the app owns',
        file: 'main.js',
        check: 'core/archive/main',
        restart: true,
        find: '            if (!state.here.open) nowhere(name);',
        replace: '            if (!state.here.open) return store(root(), name);'
    },
    {
        what: 'the note beside a file is listed as though it were a file',
        file: 'main.js',
        check: 'core/archive/main',
        restart: true,
        find: '                        if (file.indexOf(ABOUT, file.length - ABOUT.length) >= 0) return;',
        replace: '                        //sabotaged'
    }
];
