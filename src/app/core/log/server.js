//THE SAME LOG, FROM THE HALF THAT KEEPS RESTARTING.
//
//This one holds nothing. ./main.js owns the entries, and it does so precisely
//because this half is rebuilt and re-run on every save -- a log kept here would
//be emptied several times a minute during ordinary development, which is exactly
//when somebody is asking what just happened.
//
//So this is a way IN, not a second store. ../build hands the real one over on
//the host, and everything a server plugin writes lands in the log main has been
//keeping since the app started.
//
//WITHOUT A MAIN HALF IT STILL WORKS, and that is the one place this differs from
//../dataDir, which refuses. Losing a log line is not losing a credential in a
//folder nobody will look in -- and test/server-graph.test.js builds this half
//against a bare host, where a plugin that logs on load would otherwise fail to
//resolve for want of somewhere to say so. Refusing here would turn "nothing is
//keeping the log" into "the app does not start".

plugin.consumes = ['app'];
plugin.provides = ['log'];
async function plugin(imports, register) {
    var real = imports.app.host && imports.app.host.log;

    if (real) return register(null, { log: real });

    //A LOG THAT GOES NOWHERE, WHICH SAYS SO ONCE. Silence would leave somebody
    //reading a log that will never have a line in it, wondering which plugin
    //stopped writing.
    console.warn('core/log: no main half behind this one, so nothing is being kept -- ' +
        'lines still reach the console and nw.log');

    function said() {
        return function (text) {
            var out = [].slice.call(arguments, 1);
            console.log(String(text) + (out.length ? ' ' + out.join(' ') : ''));
        };
    }

    function on() {
        return {
            info: said(), good: said(), warn: said(), bad: said(),
            out: said(),
            on: function () { return on(); }
        };
    }

    await register(null, {
        log: {
            add: function (tags, text) { console.log(text); },
            on: on,
            since: function () { return []; },
            tags: function () { return []; },
            subscribe: function () { return function () { }; },
            clear: function () { },
            all: function () { return []; },
            keeper: function () { return function () { }; }
        }
    });
}
module.exports = plugin;
