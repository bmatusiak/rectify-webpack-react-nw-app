var React = require('react');
var { useState, useEffect } = React;

//example app plugin, delete this and build your own.
//both halves live here: the node side adds a route, the window renders.
plugin.consumes = ['app', 'react', 'bootstrap', 'appPackage', 'io'];
plugin.provides = [];
async function plugin(imports, register) {
    var { app, react, bootstrap, appPackage, io } = imports;

    if (app.isServer) {
        app.expressApp.get('/api/hello', function (req, res) {
            res.json({ hello: appPackage.title, pid: process.pid });
        });
        return register(null, {});
    }

    var NavBar = bootstrap.navbar;

    function App() {
        var [pong, setPong] = useState(null);

        useEffect(function () {
            io.emit('ping', {}, function (reply) { setPong(reply); });
        }, []);

        return (<>
            <NavBar title="Hello world!" sub_title={'v' + appPackage.version} />
            <div className="container">
                <p>{appPackage.title} is running.</p>
                <p className="text-secondary">
                    {pong ? 'the node side answered over socket.io, pid ' + pong.pid : 'asking the node side...'}
                </p>
            </div>
        </>);
    }

    react.root.render(<App />);

    await register(null, {});
}
module.exports = plugin;
