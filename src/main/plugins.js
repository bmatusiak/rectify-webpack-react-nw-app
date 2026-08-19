//what runs in nw's node context at boot, loaded by main.js.
//
//separate from src/plugins.js on purpose. that list is the app: it runs in
//both the window and the node context, and the node half of it is rebuilt and
//reloaded on every save. this list is the process around it — the server, the
//window, the tray — and it is not reloadable, because everything here has to
//outlive the bundle that is being thrown away.

module.exports = [

    require('./lifecycle'),//shutdown, the crash handlers, .nw-instance.json
    require('./server'),   //express, http, socket.io, the swappable router
    require('./window'),   //the nw.js window
    require('./tray'),     //the tray icon and its menu
    require('./devtools'), //the two Inspect items on that menu
    require('./bundler')   //webpack, the server half reload, and the start order

];
