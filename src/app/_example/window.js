var React = require('react');
var { useState, useEffect } = React;

//THE BROWSER HALF OF THE EXAMPLE PLUGIN. The only code here that reaches the
//page.
//
//IT REGISTERS A PAGE, which is what ../core/pages is for: nothing lists the
//pages, so a plugin puts its own into the sidebar and the shell draws whatever
//is registered. That is what lets a plugin in ../../app_plugins add a page
//without editing the app.

plugin.consumes = ['react', 'theme', 'pages', 'io', 'preferences', 'Plugin'];
plugin.provides = [];
async function plugin(imports, register) {
    var { theme, pages, io, preferences } = imports;
    var self = new imports.Plugin('example');

    var { Section, Button, Badge } = theme.ui;

    //THE PERSON'S, NOT THE APP'S -- this is the browser's own storage, so it is
    //for what they picked and not for anything the app would be sorry to lose.
    //See ../core/webStorage, and ../core/state for the other half of that pair.
    var mine = preferences('example', { pressed: 0 });

    //WHAT THE SHELL PASSES A PAGE is `open` and `toast`, and nothing else --
    //everything else comes from this plugin's own imports, closed over here.
    //That cut is what lets a page come from a tree the shell has never heard of.
    function Example({ toast }) {
        var [pressed, setPressed] = useState(mine.pressed);
        var [answer, setAnswer] = useState(null);

        useEffect(function () {
            var gone = false;

            //THE NODE HALF, OVER THE SOCKET. `ipc` is main, server and cli -- the
            //window is none of them, so a page asks its own other half this way.
            //See ../core/io.
            io.emit('example:hello', {}, function (reply) {
                if (!gone) setAnswer(reply);
            });

            return function () { gone = true; };
        }, []);

        return (
            <>
                <Section title="An example page"
                    lead="Registered from a plugin, drawn by whatever shell is running.">

                    <Button variant="primary" icon="hand-index" onClick={function () {
                        var next = pressed + 1;

                        setPressed(next);
                        mine.pressed = next;//the store writes through on assignment

                        if (toast) toast('pressed ' + next + ' times', { variant: 'success' });
                    }}>Press me</Button>

                    <p className="text-body-secondary mt-3 mb-0">
                        Pressed <Badge variant="secondary">{pressed}</Badge> times, and it survives
                        a reload because it is in <code>preferences</code>.
                    </p>
                </Section>

                <Section title="What the node half said">
                    {answer
                        ? <pre className="mb-0"><code>{JSON.stringify(answer, null, 2)}</code></pre>
                        : <p className="text-body-secondary mb-0">asking...</p>}
                </Section>
            </>
        );
    }

    //ADDED, NOT LISTED ANYWHERE -- and `remove` is owned, so a reload of this
    //half takes the page with it rather than leaving one behind that renders a
    //component from a build that no longer exists.
    var added = pages.add({
        id: 'example',
        label: 'Example',
        icon: 'box',
        Page: Example
    });

    self.own(added.remove);

    await register(null, { onDestroy: self.unload });
}
module.exports = plugin;
