
var Config = require("./config");

var app_config = require('./plugins');

//rectify reads this off the list and hands each plugin its own slice as the
//third argument to setup
app_config.config = Config();

var rectify = require('@bmatusiak/rectify');

//the window half. see src/server.js for the node half of the same list.
(async function starter() {
  var app = rectify.build(app_config, { isServer: false })

  //without a listener rectify's emit throws, and a plugin that died during
  //startup leaves a blank window with no clue which one it was
  app.on('error', function (err) {
    console.error('[rectify] a plugin failed to start', err);
    showStartupError(err);
  });

  app = await app.start();
  app.services.app.emit("start");
})();

function showStartupError(err) {
  var pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;padding:1rem;white-space:pre-wrap;font:12px/1.5 monospace;color:#b00;background:#fff';
  pre.textContent = 'a plugin failed to start\n\n' + (err && err.stack || err);
  document.body.insertBefore(pre, document.body.firstChild);
}
