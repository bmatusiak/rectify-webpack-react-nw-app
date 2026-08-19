var navbar = require('./components/navbar');
var dialog = require('./components/dialog');

plugin.consumes = ['app', 'react', 'config', 'appPackage'];
plugin.provides = ['theme', '$'];
async function plugin(imports, register) {
    //every require below is browser only, so they sit inside the branch, the
    //node bundle parses them and never loads them
    if (imports.app.isServer) return register(null, { theme: void 0, $: void 0 })

    var $ = require('jquery');
    var scss = require('./index.scss');// eslint-disable-line no-unused-vars

    var bootstrapSVG = require('bootstrap-icons/bootstrap-icons.svg');
    bootstrapSVG = bootstrapSVG.default || bootstrapSVG;//asset/source gives the string, raw-loader gives .default

    const bootstrap = require('bootstrap');

    var default_color_mode = (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

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
        themeSwitcher,
    }
    imports.theme = $theme;
    imports.$ = $;
    $theme.navbar = await navbar(imports);
    $theme.dialog = await dialog(imports);

    await register(null, {
        '$': $,
        theme: $theme
    });
}
module.exports = plugin;
