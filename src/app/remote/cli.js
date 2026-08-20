//`npm run cli -- click Save`, and the two that go with it.
//
//these are only here for the argument names. the app answers all three over
//ipc, so they would already be reachable without this file -- just as json.

plugin.consumes = ['cli', 'ipc'];
plugin.provides = [];
async function plugin(imports, register) {
    var { cli, ipc } = imports;

    function forward(verb) {
        return async function (data) {
            var out = await ipc.call(verb, data, 12000);

            var what = out.clicked || out.filled;
            if (what) console.log(what.element + (what.text ? '  "' + what.text + '"' : ''));

            if (out.count > 1) out.items.forEach(function (i) {
                console.log('  ' + i.element + (i.text ? '  "' + i.text + '"' : ''));
            });
            else if (verb == 'read') console.log(JSON.stringify({
                element: out.element, text: out.text,
                value: out.value, checked: out.checked, visible: out.visible
            }, null, 2));

            if (out.value !== undefined && verb == 'fill') console.log('  is now ' + JSON.stringify(out.value));
            if (out.checked !== undefined && out.checked !== null && verb == 'fill')
                console.log('  is now ' + (out.checked ? 'checked' : 'unchecked'));

            //worth knowing when a browser view is open alongside the window
            if (out.views > 1) console.log('  (' + out.views + ' views connected, went to the ' + out.view + ')');
        };
    }

    cli.command('views', {
        help: 'what is open to be driven',
        run: async function () {
            var out = await ipc.call('views', {}, 8000);

            if (!out.views.length) return console.log(
                out.connected + ' connected, none of them a view');

            out.views.forEach(function (v) {
                console.log((v.app ? 'window ' : 'browser') + '  ' + (v.title || v.href));
            });
        }
    });

    cli.command('click', {
        help: 'click something         <selector or its text>',
        args: ['selector'],
        run: forward('click')
    });

    cli.command('fill', {
        help: 'type into or choose     <selector or its text> <value>',
        args: ['selector', 'value'],
        run: forward('fill')
    });

    cli.command('read', {
        help: 'what does it say now    <selector or its text>',
        args: ['selector'],
        run: forward('read')
    });

    await register(null, {});
}
module.exports = plugin;
