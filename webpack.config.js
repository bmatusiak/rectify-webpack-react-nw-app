const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

//two of the three boots are bundled. src/window.js gathers every
//src/app/*/window.js, src/server.js every src/app/*/server.js — so a plugin
//declares where it runs by which files it has, and neither bundle carries the
//other's half. the third boot, src/main.js, is loaded off disk by nw.js.
const manifest = require('./package.json');

//whether a packaged build may serve a browser AT ALL. Absent means yes; the
//runtime switch still decides whether it is doing so, and still starts off.
const canServe = !(manifest.app && manifest.app.canServe === false);

//and which trees under src/ hold plugins -- package.json's "app": { "srcDirs" },
//validated into folder names by src/roots.js.
const roots = require('./src/roots');

//and whether this build may be driven from outside at all -- ./src/stance.js,
//which ./src/main.js reads too so the bundles and the boot nw loads off disk
//cannot come to differ about it.
const stance = require('./src/stance');

//THE BUILD-TIME FACTS, IN ALL THREE BUNDLES.
//
//This used to be on the packaged main alone. The server config had no
//DefinePlugin at all, which was invisible until a server-side plugin asked
//whether the build may serve: `BUILD_SERVABLE is not defined`, thrown while
//resolving the graph, so the whole node half failed to load rather than the one
//plugin that asked. The window config had none either, and was one plugin away
//from the same afternoon.
//
//It matters beyond the crash. src/app_plugins/mcp gates its http transport on
//BUILD_SERVABLE, and a constant webpack does not replace is a branch webpack
//cannot fold -- so `"canServe": false` would still have carried the endpoint and
//express's json parser into the bundle.
//
//BUILD_ROOTS is here rather than read at runtime because which trees a bundle
//CONTAINS was decided when webpack ran; see src/gather.js.
const constants = (isProduction) => new webpack.DefinePlugin({
    BUILD_PROD: JSON.stringify(isProduction),
    BUILD_SERVABLE: JSON.stringify(canServe),
    BUILD_ROOTS: JSON.stringify(roots),

    //THE FOURTH IS A FUNCTION OF THE MODE, which the other three are not. A
    //package is closed and a development build is open, so this is the one
    //constant that differs between the configs webpack is handed in a single
    //run -- and folding it out is what makes a closed build not CONTAIN the
    //branch that would have let something drive it.
    BUILD_OPEN: JSON.stringify(stance.decided(isProduction, manifest, process.env))
});

module.exports = (env, argv = {}) => {

    const isProduction = ((argv.mode || process.env.NODE_ENV) == 'production');
    const mode = isProduction ? 'production' : 'development';

    //A VENDORED LIBRARY IS NOT OURS TO TRANSPILE. ace, xterm, marked and
    //litegraph are shipped builds -- already down-levelled, and UMD, which means
    //a top-level `this` that babel rewrites to undefined when it decides a file
    //is a module. Running them through preset-env costs seconds a build (babel
    //gives up pretty-printing ace.js at 500KB and says so) to change code that
    //was finished when it was published.
    function inVendor(file) {
        return String(file).split(path.sep).join('/').split('/').indexOf('vendor') >= 0;
    }

    const babel = {
        test: /\.jsx?$/,
        exclude: function (file) { return /node_modules/.test(file) || inVendor(file); },
        use: {
            loader: 'babel-loader',
            options: {
                presets: [
                    '@babel/preset-env',
                    //classic, the sources use commonjs require('react')
                    ['@babel/preset-react', { runtime: 'classic' }]
                ]
            }
        }
    };

    const resolve = { extensions: ['.js', '.jsx', '.json'] };

    //inlined as a string, ie the bootstrap-icons sprite sheet
    const asString = { test: /\.(txt|svg)$/i, type: 'asset/source' };

    //TWO KINDS OF .css, AND THEY MUST NOT SHARE A RULE.
    //
    //These are whole stylesheets the theme kit swaps between at runtime: the
    //bootswatch builds and vanilla bootstrap. They are emitted as files rather
    //than inlined, so only the chosen one is ever fetched and parsed — and named
    //after the folder they came from, since every one of them is called
    //bootstrap.min.css.
    const swatchSources = [
        path.join(__dirname, 'src', 'app', 'ui', 'theme', 'swatch'),
        path.join(__dirname, 'node_modules', 'bootstrap', 'dist', 'css')
    ];

    const stylesheets = {
        test: /\.css$/i,
        include: swatchSources,
        type: 'asset/resource',
        generator: {
            filename: function (pathData) {
                var parts = String(pathData.filename).split('/');
                var i = parts.indexOf('swatch');
                return 'swatch-' + (i >= 0 ? parts[i + 1] : 'default') + '.css';
            }
        }
    };

    //And these belong to the plugin that required them: xterm cannot lay out a
    //row without its stylesheet, litegraph cannot draw a node without its. They
    //are injected, so they arrive with the code that needs them and go wherever
    //it goes -- including into a packaged build, which has no server to fetch a
    //file from.
    //
    //SHARING ONE RULE WITH THE ABOVE IS NOT A STYLE QUESTION. Every .css was
    //being named for the swatch folder it came from, and one that came from no
    //swatch folder was named swatch-default.css -- so the second such file broke
    //the build outright: "Multiple chunks emit assets to the same filename".
    const pluginStyles = {
        test: /\.css$/i,
        exclude: swatchSources,
        use: ['style-loader', 'css-loader']
    };

    const windowBundle = {
        name: 'window',
        target: 'web',
        mode,
        //the hot client talks to webpack-hot-middleware in main.js
        entry: isProduction
            ? path.join(__dirname, 'src', 'window.js')
            : ['webpack-hot-middleware/client?reload=true&overlay=true', path.join(__dirname, 'src', 'window.js')],
        resolve,
        output: {
            path: path.resolve(__dirname, 'dist'),
            //named after its entry, so it cannot collide with the packaged main
            //bundle, which also writes into dist
            filename: 'window.js',

            //in development the page is served from the root of a dev server.
            //a packaged build has no server at all: the page is opened out of
            //the package and asks for its stylesheets relative to itself, and
            //they are staged into a theme/ folder beside it.
            publicPath: isProduction ? 'theme/' : '/'
        },
        devtool: !isProduction ? 'inline-source-map' : false,
        module: {
            rules: [
                babel,
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        'style-loader',
                        'css-loader',
                        {
                            loader: 'sass-loader',
                            options: {
                                //sass resolves `@use "bootstrap/scss/..."` itself.
                                //sass-loader's webpack importer cannot: inside nw's
                                //node context its canonicalize() returns a URL that
                                //dart-sass does not recognise as one.
                                webpackImporter: false,
                                sassOptions: {
                                    quietDeps: true,//to supress opt in warnings
                                    loadPaths: [path.join(__dirname, 'node_modules')]
                                }
                            }
                        }
                    ]
                },
                asString,
                stylesheets,
                pluginStyles,
                { test: /\.(eot|ttf|woff|woff2|png|jpg|gif)$/i, type: 'asset' }
            ]
        },
        plugins: [
            constants(isProduction),
            new HtmlWebpackPlugin({ template: path.join(__dirname, 'src', 'index.html') }),
            ...(isProduction ? [] : [new webpack.HotModuleReplacementPlugin()])
        ]
    };

    const server = {
        name: 'server',
        target: 'node',
        mode,
        entry: path.join(__dirname, 'src', 'server.js'),
        resolve,
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'server.js',
            library: { type: 'commonjs2' }
        },
        devtool: 'source-map',
        //keep the real __dirname, webpack's default mocks it to "/"
        node: { __dirname: false, __filename: false },
        //anything from node_modules stays a real require, so the browser-only
        //half of a plugin is never loaded here, only skipped
        externals: [
            function ({ request }, callback) {
                //bare specifiers only, an absolute path here would swallow the entry
                if (request && !request.startsWith('.') && !path.isAbsolute(request))
                    return callback(null, 'commonjs ' + request);
                callback();
            }
        ],
        module: {
            rules: [
                babel,
                //scss becomes an inert string here, style-loader would touch the DOM
                { test: /\.s[ac]ss$/i, type: 'asset/source' },
                asString,
                { test: /\.(eot|ttf|woff|woff2|png|jpg|gif)$/i, type: 'asset/source' }
            ]
        },
        plugins: [constants(isProduction)]
    };

    //the packaged main. only built by tools/build.js, never in development.
    //
    //nothing is external: the point is one file with no node_modules beside it,
    //so express, socket.io and the plugins all go in. BUILD_PROD folds away the
    //development branch of src/app/build, which is what keeps webpack itself
    //from being dragged in with it.
    const main = {
        name: 'main',
        target: 'node',
        mode: 'production',
        entry: path.join(__dirname, 'src', 'main.prod.js'),
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'main.js'
        },
        devtool: false,
        resolve,
        //__dirname would otherwise be mocked to "/" and the plugins that use it
        //would quietly look in the wrong place
        node: { __dirname: false, __filename: false },
        module: { rules: [babel, asString] },
        plugins: [
            //BUILD_SERVABLE IS THE HARDENING SWITCH, and it is a constant rather
            //than a setting for the reason a constant is worth having: webpack
            //folds away every branch behind it, so a binary built with
            //"canServe": false does not CONTAIN the routes or the socket.io
            //server. A runtime flag can be flipped by whoever runs the app; this
            //cannot be flipped by anybody, because there is nothing left to
            //flip. Absent from the manifest means true.
            constants(true),
            //express reaches for a view engine by name at runtime; nothing here
            //renders server side templates, so the miss is expected
            new webpack.ContextReplacementPlugin(/express.lib/, /$^/)
        ],
        //socket.io and express both probe for optional native extras
        ignoreWarnings: [{ module: /node_modules/ }],
        stats: { errorDetails: true }
    };

    return argv.bundle == 'main' ? [main] : [windowBundle, server];
}
