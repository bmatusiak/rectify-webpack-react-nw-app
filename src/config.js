//rectify hands this to every plugin as the third argument to its setup,
//keyed by the service name the plugin provides. so `theme` below arrives as
//`config.theme` inside src/app/ui/theme.

module.exports = function () {

    var Config = {

        //src/main plugins
        window: {
            width: 1024,
            height: 768
        },

        tray: {
            icon: 'icon.png'//relative to the project root
        },

        //WHAT THE APP RECORDS ABOUT ITSELF, kept across restarts.
        //
        //THE WORDS ARE THE APP'S AND THE SHAPE IS core/events'. A plugin
        //hardcoding `task`, `queue`, `deploy` would be an app's vocabulary
        //living in core -- so the list is here, where an app already edits.
        //
        //`never` IS ASKED BEFORE `keep`, which is not a detail: a line carries
        //several tags, and one kept tag on a heartbeat is how a record fills up
        //with weather and the acts scroll out of it.
        events: {
            keep: ['app', 'cron', 'demo', 'example', 'may'],
            never: ['connection', 'connect', 'disconnect', 'data', 'tick', 'ping', 'probe', 'out'],
            most: 2000
        },

        //WHAT ANYTHING OUTSIDE MAY REACH IN A CLOSED BUILD.
        //
        //THE STANCE IS NOT HERE, and cannot be. `npm start` is open and a
        //package is closed, decided by ./stance.js when the build is made and
        //folded into the bundle as BUILD_OPEN -- because the thing being shut
        //off is the runtime, and a stance the command line can turn off is not
        //a stance. THIS is the list that applies once it is shut.
        //
        //A NAME, NOT A FLAG ON EACH HANDLER, for the reason `events.keep` above
        //is here: which commands a particular app exposes is that app's
        //vocabulary rather than core's. And 27 scattered `{ open: true }` marks
        //have no single place to READ, which is the whole point -- somebody has
        //to be able to see what a tool can reach without going through fifteen
        //plugins.
        //
        //A NEW COMMAND IS CLOSED WITHOUT ANYBODY DOING ANYTHING, which is the
        //safe way round and the reason this is a list of what is open rather
        //than a list of what is not. The drift it DOES invite -- a name left
        //here after the command was renamed -- is reported rather than silent:
        //./app/core/may/stance.js#stale finds it and the Reachable page says so.
        //
        //`may` IS LISTED ON PURPOSE. Reading what a build allows was never the
        //risk, and a person at a terminal who cannot ask has to take the app's
        //word for it.
        //
        //---- and why the driver is listed in the scaffold -------------------
        //
        //`views`, `click`, `fill` and `read` are how anything outside touches
        //the window, and a real app should CUT THEM unless it wants that. They
        //are here because this one is a demonstration and the interesting half
        //is what happens next: with them listed, a closed build still refuses
        //every control on twenty pages, because the second layer -- the
        //`Reachable` marks in the markup -- is what actually decides. Take them
        //out and a package proves only that the door is locked; leave them in
        //and it proves the marks are.
        //
        //IT IS THE SAME SHAPE AS `canServe: true` WITH `serve: false`: the
        //ability is present and what it reaches is nearly nothing. In this app
        //that is the sidebar and one demo button, and both are marked on screen.
        may: {
            open: {
                commands: ['commands', 'health', 'may', 'views', 'click', 'fill', 'read'],
                tools: [],
                resources: []
            }
        },

        //app plugins
        theme: {
            mode: null,//'light' | 'dark', or null to follow the os
            swatch: 'default'//any folder name under src/app/theme/swatch
        }

    };

    return Config;
}
