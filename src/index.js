
var Config = require("./config");

var app_config = require('./plugins');

var rectify = require('@bmatusiak/rectify');

//the window half. see src/server.js for the node half of the same list.
(async function starter() {
  var app = rectify.build(app_config, { isServer: false })
  app = await app.start();
  app.services.app.emit("start");
})();
