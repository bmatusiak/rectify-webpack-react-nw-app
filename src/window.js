
var Config = require("./config");
var rectify = require('@bmatusiak/rectify');
var showError = require('./overlay');
var wanted = require('./target');

//every src/app/<plugin>/window.js, one level down or two -- src/app/demo, or
//src/app/ui/theme. the window half, and the only code that reaches the browser.
//TWO TREES, AND WEBPACK CANNOT BE TOLD THAT IN A LOOP -- require.context takes
//a literal, so the second root in src/roots.js is a second call with the SAME
//regex. test/plugin-scan.test.js reads both back and fails if they diverge.
var found = require.context('./app', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.(js|jsx)$/);
var alsoFound = require.context('./app_plugins', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.(js|jsx)$/);
//NAMED BY WHERE THEY LIVE, on the way in -- see src/target.js. Without this
//every plugin in app.plugins is called `plugin`, which is what the setup
//functions are all called.
var plugins = [].concat(
  found.keys().map(function (key) { return wanted.stamp(found(key), key); }),
  alsoFound.keys().map(function (key) { return wanted.stamp(alsoFound(key), key); })
);

//and the base class rectify ships as a plugin rather than as part of the
//container, so a plugin that wants an emitter, a "ready" it can act on, or
//teardown collected where it is created can say `consumes: ['Plugin']`. Adding
//it here is what makes it available; nothing is obliged to use it.
plugins.push(rectify.PluginBase);

//THE WINDOW'S OWN TESTS, ALWAYS, IN DEVELOPMENT.
//
//A test that needs a document cannot be booted from a test file, so it is
//loaded here and run in place -- see src/app/core/selftest.
//
//not behind a flag: loading them is what lets the window that is already open
//be asked for any one of them, and webpack's reload carries an edited test
//straight into it. Leave the app running, change something, run one test, look.
//A flag would mean reopening the window to change target.
//
//the context sits inside the check on purpose: webpack drops the whole thing
//from a production bundle, so a packaged build has no way to load its own tests
//even if something asked it to.
if (process.env.NODE_ENV !== 'production') {
  //a literal, because webpack resolves this at build time and a variable here
  //would leave it with nothing to gather
  var tests = require.context('./app', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.test\.js$/);
  var alsoTests = require.context('./app_plugins', true, /^\.\/[^_./][^/]*(?:\/(?!vendor\/)[^_./][^/]*)?\/window\.test\.js$/);

  //tagged with the plugin each came from, so one of them can be aimed at when
  //the run is asked for rather than when the window is opened
  [tests, alsoTests].forEach(function (context) {
    context.keys().forEach(function (key) {
      plugins.push(wanted.tag(context(key), key.replace('./', '')));
    });
  });
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
