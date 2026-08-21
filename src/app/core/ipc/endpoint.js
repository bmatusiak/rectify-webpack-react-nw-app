var os = require('os');
var path = require('path');

//where the app listens, and where the cli looks. both sides derive it from the
//package name, so nothing has to be discovered or written down.
//
//  windows   a named pipe, which lives in the pipe namespace and not on disk
//  posix     a unix domain socket, a real file in the temp directory
//
//the windows form is built from char codes rather than written out, because a
//literal is four backslashes deep and every layer between here and the file
//has an opinion about those.
module.exports = function endpoint(name) {
    if (process.platform != 'win32') return path.join(os.tmpdir(), name + '.sock');

    var b = String.fromCharCode(92);
    return b + b + '.' + b + 'pipe' + b + name;
};

//and where the shared secret sits.
//
//a named pipe on windows is reachable by anyone logged into the machine -- the
//default acl is not restrictive -- and /tmp on posix is world-readable. the
//socket being hard to find is not the same as it being hard to reach, so the
//app writes a token beside it and refuses to take a command from a client that
//cannot repeat it.
//
//the temp directory is per-user on windows and the file is 0600 on posix, so
//in both cases the secret is only readable by the account that started the app.
module.exports.token = function (name) {
    return path.join(os.tmpdir(), name + '.token');
};
