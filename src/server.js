
var Config = require("./config");

var app_config = require('./plugins');

//rectify reads this off the list and hands each plugin its own slice as the
//third argument to setup
app_config.config = Config();

var rectify = require('@bmatusiak/rectify');

//rectify already has the slot: register(null, { thing, onDestroy }) collects
//onDestroy — and then never calls it, the array is private and unused. this
//picks it up on the way past, so a server half can undo itself right where it
//declares itself, the way an effect returns its cleanup.
function withCleanups(plugins, sink) {
  var wrapped = plugins.map(function (setup) {
    function plugin(imports, register, config) {
      return setup(imports, function (err, provided) {
        if (provided && typeof provided.onDestroy == 'function') sink.push(provided.onDestroy);
        return register(err, provided);
      }, config);
    }
    plugin.consumes = setup.consumes;
    plugin.provides = setup.provides;
    return plugin;
  });
  wrapped.config = plugins.config;//rectify reads the app config off the list
  return wrapped;
}

//the node half of the same list src/index.js runs in the window.
//main.js calls this with the express host, which rectify merges into the
//`app` service, so any plugin can reach it with consumes: ['app'].
//
//the returned destroy() is what makes the server half reloadable: main.js
//calls it before loading a freshly built bundle.
module.exports = async function server(host) {
  var cleanups = [];
  var app = rectify.build(withCleanups(app_config, cleanups), Object.assign({ isServer: true }, host));

  var failed = null;
  app.on('error', function (err) {
    failed = err;
    console.error('[rectify] a plugin failed to start', err && err.stack || err);
  });

  app = await app.start();
  if (failed) throw failed;

  app.services.app.emit("start");

  return {
    app: app,
    destroy: function () {
      //collected in dependency order, so undo them backwards
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (e) { console.error('[rectify] cleanup failed', e && e.stack || e); }
      }
    }
  };
};
