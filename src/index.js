
var Config = require("./config");

var app_config = []
  .concat(
    require('./core/index'),
    [
      require('./app/index')
    ]);

var rectify = require('@bmatusiak/rectify');

(async function starter() {
  var app = rectify.build(app_config)
  app = await app.start();
  app.services.app.emit("start");
})();