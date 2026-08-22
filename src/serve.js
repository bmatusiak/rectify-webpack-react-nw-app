//WHETHER A BROWSER MAY BE A CLIENT OF THIS APP, AND WHERE.
//
//Shared by both main boots so they cannot disagree about it, and kept out of
//src/config.js on purpose: config.js is a bundled source file, and a packaged
//app that has to be rebuilt to be reconfigured is not configurable.
//
//TWO WAYS TO SAY IT, AND THE FLAG WINS:
//
//    package.json   "app": { "serve": true }
//                   "app": { "serve": "0.0.0.0:8080" }
//    argv           --serve                  on, wherever is free
//                   --serve=8080             on, at that port
//                   --serve=0.0.0.0:8080     on, at that address
//                   --no-serve               off
//
//A manifest field is how somebody who ships the app decides; a flag is how
//somebody running it decides once, without editing anything. The flag winning
//is the only ordering that makes `--serve` useful on a build that ships with it
//off, which is the case it exists for.
//
//IT ANSWERS false OR AN ADDRESS, never true. A caller that only wants the
//yes-or-no can read it as one, and a caller that has to open a socket has
//somewhere to open it -- rather than every one of them repeating the same
//guesses about defaults and environment variables.
//
//WHAT IT DOES NOT CONTROL IS WHETHER HTTP RUNS AT ALL. In development webpack
//serves the window half over http and hot reloads it, so there is a server
//either way; what this decides is whether socket.io is on it and whether the
//tray offers to open a browser. The nw window never uses http for its own
//traffic in either case -- it is on the bridge, which is what makes development
//behave the way a package does.

var DEFAULT_HOST = 'localhost';

//0 means "whatever is free". Nothing here depends on a fixed port, so two of
//these can run side by side unless somebody asks otherwise.
var ANY_PORT = 0;

//"8080" -> port. "0.0.0.0:8080" -> both. "" or true -> the defaults.
//
//A HOST WITH NO PORT IS TAKEN AS A PORT ONLY IF IT LOOKS LIKE ONE. `--serve=x`
//is a mistake rather than a hostname to listen on, and answering the defaults
//would hide it, so it is refused by returning null and the caller falls back.
function address(said) {
    if (said === true) return { host: DEFAULT_HOST, port: ANY_PORT };
    if (said === false || said === null || said === undefined) return null;

    var text = String(said).trim();
    if (!text) return { host: DEFAULT_HOST, port: ANY_PORT };

    var host = DEFAULT_HOST;
    var port = text;

    var cut = text.lastIndexOf(':');
    if (cut >= 0) {
        host = text.slice(0, cut) || DEFAULT_HOST;
        port = text.slice(cut + 1);
    }

    if (!/^[0-9]+$/.test(port)) return null;
    return { host: host, port: Number(port) };
}

//the last one wins, so `--serve --no-serve` is a decision and not a puzzle
function asked(argv) {
    var list = Array.prototype.slice.call(argv || []);
    var answer = null;

    list.forEach(function (one) {
        var text = String(one);
        if (text == '--no-serve') answer = false;
        else if (text == '--serve') answer = true;
        else if (text.indexOf('--serve=') === 0) answer = text.slice('--serve='.length);
    });

    return answer;
}

module.exports = function serve(pkg, argv) {
    var flag = asked(argv);
    var said = flag !== null ? flag : (pkg && pkg.app ? pkg.app.serve : undefined);

    if (said === false || said === null || said === undefined) return false;

    var where = address(said);
    if (!where) {
        console.error('serve: "' + said + '" is not a port or a host:port. Serving where it can instead.');
        return { host: DEFAULT_HOST, port: ANY_PORT };
    }
    return where;
};

module.exports.asked = asked;
module.exports.address = address;
module.exports.DEFAULT_HOST = DEFAULT_HOST;
