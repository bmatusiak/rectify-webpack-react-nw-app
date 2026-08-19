//rectify hands this to every plugin as the third argument to its setup,
//keyed by the service name the plugin provides. so `theme` below arrives as
//`config.theme` inside src/core/theme.

module.exports = function () {

    var Config = {

        theme: {
            mode: null//'light' | 'dark', or null to follow the os
        }

    };

    return Config;
}
