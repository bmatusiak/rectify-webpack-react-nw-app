
var Config = require("./config");

var app_config = require('./plugins');

//rectify reads this off the list and hands each plugin its own slice as the
//third argument to setup
app_config.config = Config();

var rectify = require('@bmatusiak/rectify');
var showError = require('./overlay');

//the window half. see src/server.js for the node half of the same list.
(async function starter() {
  var app = rectify.build(app_config, { isServer: false })

  //without a listener rectify's emit throws, and a plugin that died during
  //startup leaves a blank window with no clue which one it was
  app.on('error', function (err) {
    console.error('[rectify] a plugin failed to start', err);
    showError('a plugin failed to start', err);
  });

  app = await app.start();
  app.services.app.emit("start");
})();
