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

            //A REFUSAL IS AN ANSWER AND HAS TO LOOK LIKE ONE.
            //
            //../window.js answers `{ refused }` for a guarded control and for a
            //closed build, and this printed NEITHER: a refused click wrote
            //nothing at all and exited 0, which reads exactly like a click that
            //worked. Measured -- `node src/cli.js click Guarded` against a
            //closed build was silent and successful.
            //
            //THROWN RATHER THAN PRINTED, so it goes out the way every other
            //failure here does: ../core/cli prints it and the exit code says so.
            //A driver reading exit codes is the whole reason this matters --
            //`npm run drive` would otherwise count a refusal as a pass.
            if (out.refused) throw new Error(out.refused);

            var what = out.clicked || out.filled;
            if (what) console.log(what.element + (what.text ? '  "' + what.text + '"' : ''));

            if (out.count > 1) out.items.forEach(function (i) {
                //the ratio is the reason to ask about forty things at once
                var c = i.contrast;
                var how = c ? '  ' + c.ratio + ':1' + (c.readable ? '' : ' LOW') : '';

                //when it fails, the two colours are the next thing anyone asks
                if (c && !c.readable) how += '  ' + c.color + ' on ' + c.background;

                console.log('  ' + i.element + (i.text ? '  "' + i.text + '"' : '') + how);
            });
            else if (verb == 'read') {
                //everything the view said about it, minus the routing. listing
                //the fields here meant every new one had to be added twice,
                //and the one I wanted was silently dropped.
                var seen = Object.assign({}, out);
                delete seen.view; delete seen.views; delete seen.found;
                console.log(JSON.stringify(seen, null, 2));
            }

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
                //THE NAME FIRST, because it is what the next command needs:
                //`click Save '{"view":"browser-1"}'` only works if the listing
                //said `browser-1` rather than describing the page.
                console.log((v.session || '?').padEnd(10) + '  ' + (v.title || v.href));
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
