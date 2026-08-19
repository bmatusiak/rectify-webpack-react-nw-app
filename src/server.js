
var Config = require("./config");

var app_config = require('./plugins');

var rectify = require('@bmatusiak/rectify');

//the node half of the same list src/index.js runs in the window.
//main.js calls this with the express host, which rectify merges into the
//`app` service, so any plugin can reach it with consumes: ['app'].
module.exports = async function server(host) {
  var app = rectify.build(app_config, Object.assign({ isServer: true }, host));
  app = await app.start();
  app.services.app.emit("start");
  return app;
};
