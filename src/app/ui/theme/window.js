//---------------------------------------------------------------------------
//this is an example kit, not the scaffold's opinion. bootstrap, jquery and
//bootstrap-icons are here because something had to be, and bringing your own
//style is the expected thing to do — tailwind, your own css, a component
//library, or nothing at all.
//
//`theme` is the slot. it is the only name anything outside this directory
//knows: a plugin asks for `theme` and reads `theme.ui`. so a kit swap is this
//whole directory replaced by one that provides the same service with whatever
//it carries. what this one carries:
//
//  ui               every component, in ./components
//  themeSwitcher    flips light/dark, remembered through the `config` store
//  mode             which of the two is on
//  swatches         the stylesheets in ./swatch, by name
//  swatch           which one is on
//  setSwatch        wear a different one, now
//  bs               the kit's own library, bootstrap's javascript
//  $                the kit's dom helper, jquery. deliberately not a top level
//                   service, since another kit may not want one
//
//none of those names are required either. they are what this kit provides and
//what the demo happens to use.
//
//src/config.js pins the starting colour mode, if you want one.
//---------------------------------------------------------------------------

var ui = require('./components/ui');
var form = require('./components/form');
var nav = require('./components/nav');
var layout = require('./components/layout');
var examples = require('./components/examples');
var makeOverlays = require('./components/overlay');
var makeDisclosure = require('./components/disclosure');
var swatches = require('./swatches');

plugin.consumes = ['react', 'settings', 'appPackage'];
plugin.provides = ['theme'];
//`config` here is the third argument rectify passes: src/config.js, keyed by
//the service name. `imports.settings` is the storage plugin, a different thing.
async function plugin(imports, register, config) {
    var $ = require('jquery');
    var scss = require('./index.scss');// eslint-disable-line no-unused-vars

    var bootstrapSVG = require('bootstrap-icons/bootstrap-icons.svg');
    bootstrapSVG = bootstrapSVG.default || bootstrapSVG;//asset/source gives the string, raw-loader gives .default

    const bootstrap = require('bootstrap');

    //src/config.js can pin this, otherwise follow the os
    var startingMode = (config.theme && config.theme.mode) ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    var stored = imports.settings('theme', {
        mode: startingMode,
        swatch: (config.theme && config.theme.swatch) || 'default'
    });

    //bootstrap arrives as a link rather than compiled into index.scss, so it
    //can be swapped without a rebuild.
    //
    //the link goes at the very top of head, before anything style-loader has
    //put there or will put there. that ordering is the whole reason the kit's
    //own rules can correct a swatch: appended, the link came last, and a
    //swatch's `.text-body-secondary { ... !important }` beat ours on source
    //order alone -- same specificity, same importance, later wins.
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'theme-swatch';
    document.head.insertBefore(link, document.head.firstChild);

    //eight of the bootswatch themes are dark designs. asking one of those for
    //light mode gets you a dark page either way, so the honest thing is to
    //believe the stylesheet rather than the setting: once it has loaded, look
    //at what the body actually became and make data-bs-theme say that. the
    //shell then always agrees with the page it frames.
    var locked = false;

    function agree() {
        //ask for what was wanted first. measuring without doing that measures
        //the answer to the last question, which is how a page that went dark
        //once could never be asked to come back.
        document.body.setAttribute('data-bs-theme', stored.mode);

        var showing = isDark(getComputedStyle(document.body).backgroundColor) ? 'dark' : 'light';

        //the swatch ignored what it was asked for, so the toggle cannot move it
        locked = showing !== stored.mode;
        if (locked) document.body.setAttribute('data-bs-theme', showing);

        listeners.forEach(function (fn) { fn(showing); });
    }

    function wear(name) {
        if (!swatches[name]) name = 'default';

        //a stylesheet that has not arrived yet still measures as the last one
        link.onload = agree;
        link.href = swatches[name];
        stored.swatch = name;
        return name;
    }

    wear(stored.swatch);

    //the icon sprite is one document injected once, so every <use> in every
    //component resolves without another request
    if ($('#bootstrap-icon-svg').length == 0)
        $(bootstrapSVG)
            .attr('id', 'bootstrap-icon-svg')
            .attr('class', 'd-none')
            .prependTo(document.body);

    $('body').attr('data-bs-theme', stored.mode);

    var listeners = [];

    //what a swatch painted, rather than what it was asked to paint
    function isDark(colour) {
        var parts = String(colour).match(/[0-9]+(\.[0-9]+)?/g);
        if (!parts || parts.length < 3) return false;
        return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000 < 128;
    }

    var $theme = {
        bs: bootstrap,
        $: $,

        get mode() { return stored.mode; },
        get swatch() { return stored.swatch; },

        //true when the swatch is a dark design and light was asked for, or the
        //other way about. a control that offers a choice it cannot honour is
        //worse than one that says so.
        get modeLocked() { return locked; },

        swatches: Object.keys(swatches).sort(),

        setSwatch: function (name) {
            var applied = wear(name);
            listeners.forEach(function (fn) { fn(stored.mode); });
            return applied;
        },

        themeSwitcher: function () {
            var next = stored.mode == 'dark' ? 'light' : 'dark';
            stored.mode = next;
            document.body.setAttribute('data-bs-theme', next);

            //and then find out whether the swatch went along with it
            agree();
            return stored.mode;
        },

        //so a component can re-render when the mode flips
        onModeChange: function (fn) {
            listeners.push(fn);
            return function () {
                var i = listeners.indexOf(fn);
                if (i >= 0) listeners.splice(i, 1);
            };
        }
    };

    //the parts that need bootstrap's own instances are built against it
    var overlays = makeOverlays(bootstrap);
    var disclosure = makeDisclosure(bootstrap);

    $theme.ui = Object.assign({}, ui, form, nav, layout, examples, overlays, disclosure);

    await register(null, { theme: $theme });
}
module.exports = plugin;
