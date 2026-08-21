//nw.js loads `main` from package.json into a generated background page at the
//app root, and resolves that script's requires from the root rather than from
//the file's own directory — so a boot living in src/ cannot require its
//neighbours. this hands over to it as an ordinary module, where relative paths
//mean what they look like.
//
//the boots are src/main.js (or src/main.prod.js when packaged), src/server.js,
//src/window.js and src/cli.js. what they share is src/boot.js.
require('./src/main.js');
