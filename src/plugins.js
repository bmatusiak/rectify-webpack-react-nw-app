//every plugin the app loads. both entries read this one list:
//src/index.js runs it in the window, src/server.js runs it in nw's node
//context, and a plugin branches on app.isServer to pick its half.

module.exports = [

    //core
    require('./core/react'),
    require('./core/storage'),
    require('./core/io'),
    require('./core/nw'),

    //app
    require('./app/theme'),
    require('./app')

];
