var navbar = require('./components/navbar');
var dialog = require('./components/dialog');

plugin.consumes = ['app', 'react', 'config', 'appPackage'];
plugin.provides = ['theme'];
//`config` here is the third argument rectify passes: src/config.js, keyed by
//the service name. `imports.config` is the storage plugin, a different thing.
async function plugin(imports, register, config) {
    //every require below is browser only, so they sit inside the branch, the
    //node bundle parses them and never loads them
    if (imports.app.isServer) return register(null, { theme: void 0 })

    var $ = require('jquery');
    var scss = require('./index.scss');// eslint-disable-line no-unused-vars

    var bootstrapSVG = require('bootstrap-icons/bootstrap-icons.svg');
    bootstrapSVG = bootstrapSVG.default || bootstrapSVG;//asset/source gives the string, raw-loader gives .default

    const bootstrap = require('bootstrap');

    //src/config.js can pin this, otherwise follow the os
    var default_color_mode = config.theme.mode ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    var config = imports.config('theme', {
        mode: default_color_mode
    })

    if ($('#bootstrap-icon-svg').length == 0)
        $(bootstrapSVG)
            .attr('id', 'bootstrap-icon-svg')
            .attr('class', 'd-none')
            .prependTo(document.body)


    var themeSwitcher = function () {
        var newMode = $('body').attr('data-bs-theme') == 'dark' ? 'light' : 'dark';
        $('body').attr('data-bs-theme', newMode);
        config.mode = newMode;
    }

    $('body').attr('data-bs-theme', config.mode);

    var $theme = {
        bs: bootstrap,//the kit itself, swap this file to swap kits
        $,//the kit's dom helper. not a top level service, another kit may not want one
        themeSwitcher,
    }
    imports.theme = $theme;
    $theme.navbar = await navbar(imports);
    $theme.dialog = await dialog(imports);

    await register(null, {
        theme: $theme
    });
}
module.exports = plugin;
