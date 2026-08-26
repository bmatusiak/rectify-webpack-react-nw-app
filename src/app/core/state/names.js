//WHAT MAY BECOME A FILE OR A FOLDER HERE, AND WHAT MAY NOT.
//
//A module rather than part of ./main.js because BOTH halves need it and only
//one of them owns a drawer: ./server.js refuses everything that touches disk
//and still answers `slug`, which is arithmetic. Requiring main from server to
//get at it would pull the whole main-side plugin into the server bundle for the
//sake of one pure function.
//
//IT IS ALSO THE HALF THAT CAN BE ASKED WITHOUT AN APP -- see ./node.test.js.

//A NAME IS LETTERS, DIGITS AND DASHES, and this is a refusal rather than a
//sanitiser. Quietly turning `../../etc/passwd` into `etcpasswd` writes a file
//somewhere surprising and says nothing; a name that is not a name is a caller
//bug, and it should be one at the call that made it.
function fileName(name) {
    var clean = String(name == null ? '' : name).trim();

    if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) {
        throw new Error('a kept thing is named in letters, digits and dashes -- "' + name + '" is not');
    }

    return clean + '.json';
}

//A NAMESPACE IS A NAME TOO, by the same rule and for a harder reason: this
//becomes a directory that everything the namespace keeps then lives inside, so
//a name that escapes takes a whole drawer with it rather than one document.
//
//DOT AND UNDERSCORE ARE ALLOWED HERE AND NOT IN A DOCUMENT NAME, because a
//namespace is usually named after something a person already has -- a folder, a
//project, a branch -- and `my_project.v2` is an ordinary such name. `slug` is
//how anything less tidy becomes one deliberately.
function folderName(name) {
    var clean = String(name == null ? '' : name).trim();

    if (!clean || !/^[a-z0-9][a-z0-9._-]*$/i.test(clean)) {
        throw new Error('a namespace is named in letters, digits, dot, dash and underscore -- "'
            + name + '" is not. If it is a path, put it through state.slug() first, which is '
            + 'there so that turning one into the other is a decision rather than a guess.');
    }

    return clean;
}

//A NAME FROM ANYTHING, AND THE HASH IS NOT DECORATION.
//
//An app whose namespaces are folders has two of them called `workspace` sooner
//or later, on different disks, and a slug of the last part alone would put both
//in one drawer -- which is the contamination the whole idea is against,
//arriving through the door meant to prevent it.
//
//So the readable part is for a person looking at the directory, and the sum
//over the WHOLE string is what makes it one namespace rather than two. Neither
//half is sufficient: the sum alone is a directory nobody can identify, and the
//readable part alone is the collision.
function slug(text) {
    var full = String(text == null ? '' : text);

    var readable = full.split(/[\\/]/).filter(Boolean).pop() || 'namespace';

    readable = readable.replace(/[^a-z0-9._-]+/gi, '-')

        //IT HAS TO START WITH A LETTER OR A DIGIT, which is `folderName`'s rule
        //and not a preference. Stripping only dashes left `slug('.')` answering
        //`.-1a` -- a name that one refuses, and a HIDDEN directory besides. `.`
        //and `..` are the two inputs most likely to arrive from something that
        //went wrong upstream, so they are the two this must not fumble.
        .replace(/^[^a-z0-9]+/i, '')

        .replace(/-+$/g, '').slice(0, 40) || 'namespace';

    //NOT A CRYPTOGRAPHIC HASH, and it does not need to be: this is telling two
    //directories apart on one machine, not resisting anybody. `crypto` would
    //also make this the only file here that cannot be asked in a browser.
    var sum = 0;
    for (var i = 0; i < full.length; i++) sum = ((sum * 31) + full.charCodeAt(i)) >>> 0;

    return readable + '-' + sum.toString(36);
}

module.exports.fileName = fileName;
module.exports.folderName = folderName;
module.exports.slug = slug;

//WHERE THE NAMESPACED DRAWERS SIT, under the app's own. A document is
//`<name>.json` and this is a directory, so the two cannot collide however an
//app names things.
module.exports.NAMESPACES = 'namespaces';
