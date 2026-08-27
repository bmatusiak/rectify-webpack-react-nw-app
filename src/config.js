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

        //app plugins
        theme: {
            mode: null,//'light' | 'dark', or null to follow the os
            swatch: 'default'//any folder name under src/app/theme/swatch
        }

    };

    return Config;
}
