const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

//two entries over one plugin list: src/index.js runs the plugins in the window,
//src/server.js runs the same plugins in nw's node context. a plugin branches on
//app.isBrowser and keeps both halves in the one file.
module.exports = (env, argv = {}) => {

    const isProduction = ((argv.mode || process.env.NODE_ENV) == 'production');
    const mode = isProduction ? 'production' : 'development';

    const babel = {
        test: /\.(jsx?|tsx?)$/,
        exclude: /node_modules/,
        use: {
            loader: 'babel-loader',
            options: {
                presets: [
                    '@babel/preset-env',
                    //classic, the sources use commonjs require('react')
                    ['@babel/preset-react', { runtime: 'classic' }],
                    //types are stripped, not checked. `npm run typecheck` checks.
                    '@babel/preset-typescript'
                ]
            }
        }
    };

    //so require('./core/storage') finds index.ts as readily as index.js
    const resolve = { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] };

    //inlined as a string, ie the bootstrap-icons sprite sheet
    const asString = { test: /\.(txt|svg)$/i, type: 'asset/source' };

    //native node addons, ie nw.js native modules
    const nodeAddon = { test: /\.node$/i, loader: 'node-loader' };

    const client = {
        name: 'client',
        target: 'web',
        mode,
        //the hot client talks to webpack-hot-middleware in main.js
        entry: isProduction
            ? path.join(__dirname, 'src', 'index.js')
            : ['webpack-hot-middleware/client?reload=true&overlay=true', path.join(__dirname, 'src', 'index.js')],
        resolve,
        output: {
            path: path.resolve(__dirname, 'dist'),
            publicPath: '/'
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
                { test: /\.(eot|ttf|woff|woff2|png|jpg|gif)$/i, type: 'asset' },
                nodeAddon
            ]
        },
        plugins: [
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
                { test: /\.(eot|ttf|woff|woff2|png|jpg|gif)$/i, type: 'asset/source' },
                nodeAddon
            ]
        }
    };

    return [client, server];
}
