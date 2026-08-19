//---------------------------------------------------------------------------
//this is an example kit, not the scaffold's opinion. bootstrap, jquery and
//bootstrap-icons are here because something had to be, and bringing your own
//style is the expected thing to do — tailwind, your own css, a component
//library, or nothing at all.
//
//`theme` is the slot. it is the only name anything outside this directory
//knows: src/app/index.js asks for `theme` and reads `theme.navbar`. so a kit
//swap is this whole directory replaced by one that provides the same service
//with whatever it carries. the pieces here happen to be:
//
//  navbar, dialog   the components, in ./components
//  themeSwitcher    flips light/dark, remembered through the `config` store
//  bs               the kit's own library, bootstrap's js in this one
//  $                the kit's dom helper, jquery here. deliberately not a top
//                   level service, since another kit may not want one
//
//none of those names are required either. they are what this kit provides,
//and what the example plugin happens to use.
//
//src/config.js pins the starting colour mode, if you want one.
//---------------------------------------------------------------------------

var navbar = require('./components/navbar');
var dialog = require('./components/dialog');

plugin.consumes = ['react', 'config', 'appPackage'];
plugin.provides = ['theme'];
//`config` here is the third argument rectify passes: src/config.js, keyed by
//the service name. `imports.config` is the storage plugin, a different thing.
async function plugin(imports, register, config) {
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
