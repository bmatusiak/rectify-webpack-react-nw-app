
var Config = require("./config");

var app_config = require('./plugins');

//rectify reads this off the list and hands each plugin its own slice as the
//third argument to setup
app_config.config = Config();

var rectify = require('@bmatusiak/rectify');

//the node half of the same list src/index.js runs in the window.
//main.js calls this with the express host, which rectify merges into the
//`app` service, so any plugin can reach it with consumes: ['app'].
//
//the returned destroy() is what makes the server half reloadable: plugins
//register their teardown with app.on('destroy'), and main.js calls this
//before loading a freshly built bundle.
module.exports = async function server(host) {
  var app = rectify.build(app_config, Object.assign({ isServer: true }, host));

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
      app.services.app.emit('destroy');
    }
  };
};
