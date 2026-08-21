
var Config = require("./config");
var rectify = require('@bmatusiak/rectify');
var showError = require('./overlay');

//every src/app/<plugin>/window.js, one level down or two -- src/app/demo, or
//src/app/ui/theme. the window half, and the only code that reaches the browser.
var found = require.context('./app', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.(js|jsx)$/);
var plugins = found.keys().map(found);

//and the base class rectify ships as a plugin rather than as part of the
//container, so a plugin that wants an emitter, a "ready" it can act on, or
//teardown collected where it is created can say `consumes: ['Plugin']`. Adding
//it here is what makes it available; nothing is obliged to use it.
plugins.push(rectify.PluginBase);

//THE WINDOW'S OWN TESTS, when asked for.
//
//A test that needs a document cannot be booted from a test file, so it is
//loaded here instead and run in place -- see src/app/core/selftest. Asked for
//with ?selftest on the url, which src/app/core/window/main.js puts there when
//the app was started with --selftest.
//
//the context sits inside the `if` on purpose: webpack drops the whole thing
//from a production bundle, so a packaged build has no way to load its own tests
//even if something asked it to.
if (process.env.NODE_ENV !== 'production' && new URLSearchParams(location.search).has('selftest')) {
  var tests = require.context('./app', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.test\.js$/);
  tests.keys().forEach(function (key) { plugins.push(tests(key)); });
  console.log('selftest: loaded ' + tests.keys().length + ' window test plugins');
}

plugins.config = Config();

(async function starter() {
  var app = rectify.build(plugins, { isWindow: true })

  //without a listener rectify's emit throws, and a plugin that died during
  //startup leaves a blank window with no clue which one it was
  app.on('error', function (err) {
    console.error('[rectify] a plugin failed to start', err);
    showError('a plugin failed to start', err);
  });

  app = await app.start();
  app.services.app.emit("start");
})();
