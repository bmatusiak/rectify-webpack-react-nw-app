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
