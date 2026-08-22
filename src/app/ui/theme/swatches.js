//THE FOLDER IS THE REGISTRY HERE TOO: drop a bootswatch build into
//./swatch/<name>/ and it appears, delete one and it does not. webpack emits
//each as its own file rather than inlining it, so only the chosen one is ever
//fetched and parsed — but every one of them is still carried in the package,
//which is about 230kb each. deleting the ones you will not use is the way to
//get that back.

var found = require.context('./swatch', true, /^\.\/[^/]+\/bootstrap\.min\.css$/);

var swatches = { 'default': require('bootstrap/dist/css/bootstrap.min.css') };

found.keys().forEach(function (key) {
    //'./flatly/bootstrap.min.css' -> 'flatly'
    var name = key.split('/')[1];
    swatches[name] = found(key);
});

//asset/resource hands back a url, sometimes wrapped as an es module
Object.keys(swatches).forEach(function (name) {
    var value = swatches[name];
    swatches[name] = (value && value.default) || value;
});

module.exports = swatches;
