
var Config = require("./config");

var app_config = []
  .concat(
    require('./core/index'),
    [
      require('./app/index')
    ]);

var rectify = require('@bmatusiak/rectify');

//the same plugin list as src/index.js, run in nw's node context.
//main.js calls this with the express host, which rectify merges into the
//`app` service, so any plugin can reach it with consumes: ['app'].
module.exports = async function server(host) {
  var app = rectify.build(app_config, host);
  app = await app.start();
  app.services.app.emit("start");
  return app;
};
