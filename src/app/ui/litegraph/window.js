var React = require('react');
var { useRef, useEffect } = React;

//LITEGRAPH, REQUIRED RATHER THAN FETCHED — the same decision ../editor and
//../xterm make about ace and xterm, for the same reason.
//
//IT IS NOT UMD. It is `(function (y) { ... })(this)`, repeated once per bundled
//node pack, and `this` at the top of a webpack module is that module's exports
//— not the window. That works out, because every pack in the file shares the
//one module and therefore the one object. What does NOT work out is babel: it
//decides a file is a module and rewrites top-level `this` to undefined, at
//which point the library throws on its first line. webpack.config.js keeps
//every vendor/ folder away from babel, which is what makes this a plain require
//rather than a script tag.
var vendor = require('./vendor/litegraph/litegraph.js');

//IT CANNOT DRAW WITHOUT THIS. litegraph paints the canvas itself, but its
//context menus, search box and dialogs are real DOM — unstyled they are
//unreadable boxes stacked in the corner of the window.
require('./vendor/litegraph/litegraph.css');

//---------------------------------------------------------------------------
//a graph: things, and what connects them.
//
//A LIST IS NOT GOOD ENOUGH, AND IT IS THE SAME ARGUMENT ../editor MAKES about a
//diff. The Data page already lists this app's services, sorted and paginated,
//and a list can tell you that `build` consumes seven things. What it cannot
//show is the SHAPE — that everything hangs off `app`, that `io` sits between
//the window and the node half, that the graph is a few layers deep and not
//thirty. From a list a reader works that out by holding it in their head; from
//a picture they see it.
//
//A PLUGIN OF ITS OWN, WITH ITS OWN VENDOR FOLDER, like the other three here.
//
//IT TAKES A DESCRIPTION, NOT A GRAPH. The caller says what the nodes and edges
//are, in plain objects. litegraph's own API — registerNodeType, addInput,
//connect, the canvas lifecycle — stays behind this file, so a caller cannot
//half-learn litegraph, and replacing this plugin with a different renderer does
//not touch a single page.
//
//IT KNOWS NOTHING ABOUT THE THEME, deliberately, for the same reason as
//../editor and ../xterm: every pane consumes the theme, so a theme that this
//consumed back would be a cycle.
//---------------------------------------------------------------------------

plugin.consumes = ['react'];
plugin.provides = ['litegraph'];
async function plugin(imports, register) {

    var LiteGraph = vendor.LiteGraph;
    var LGraph = vendor.LGraph;
    var LGraphCanvas = vendor.LGraphCanvas;

    //TWO PLACES IN THE LIBRARY REACH FOR A GLOBAL `LiteGraph` rather than the
    //one they were handed — allow_scripts, and a camera-matrix hook. Neither is
    //on any path this app takes, but a ReferenceError out of a vendored file is
    //a miserable thing to diagnose, and putting the namespace where they look
    //costs one line.
    if (typeof window != 'undefined' && !window.LiteGraph) {
        window.LiteGraph = LiteGraph;
        window.LGraph = LGraph;
        window.LGraphCanvas = LGraphCanvas;
    }

    //MATCHES THE OTHER SURFACES IN THIS APP rather than litegraph's own grey, so
    //a graph sitting in a page does not look like a hole cut in it. The same
    //colours as ../xterm's LOOK, on purpose.
    var LOOK = {
        background: '#0a0d12',
        node: '#161b22',
        title: '#1c2430',
        text: '#c9d1d9',
        link: '#4aa3ff'
    };

    //ONE NODE TYPE, REGISTERED ONCE. litegraph is built for graphs that RUN:
    //every node is a class with an onExecute, registered by name before one can
    //be created. Nothing here runs — these are boxes with named ports — so
    //there is a single type that draws whatever it was told to, and the registry
    //is not something callers have to think about.
    var TYPE = 'rectify/node';
    if (!LiteGraph.registered_node_types[TYPE]) {
        var Box = function () { /* ports are added per instance, in build() */ };
        Box.title = 'node';
        LiteGraph.registerNodeType(TYPE, Box);
    }

    //---- a description in, a graph out ---------------------------------------

    function build(graph, nodes, links) {
        var made = {};

        (nodes || []).forEach(function (spec) {
            var node = LiteGraph.createNode(TYPE);
            if (!node) return;

            node.title = spec.title == null ? String(spec.id) : String(spec.title);
            (spec.inputs || []).forEach(function (name) { node.addInput(String(name), 0); });
            (spec.outputs || []).forEach(function (name) { node.addOutput(String(name), 0); });

            //SIZED FROM ITS PORTS rather than left at the default. litegraph's
            //default width fits the word `node` and clips anything longer, and a
            //graph whose labels are cut in half is worse than no graph.
            node.size = node.computeSize();
            node.size[0] = Math.max(node.size[0], 60 + node.title.length * 7);

            if (spec.pos) node.pos = [spec.pos[0], spec.pos[1]];
            node.color = spec.colour || LOOK.title;
            node.bgcolor = spec.background || LOOK.node;

            node.__id = spec.id;
            graph.add(node);
            made[spec.id] = node;
        });

        (links || []).forEach(function (link) {
            var from = made[link.from];
            var to = made[link.to];
            //A MISSING END IS THE CALLER'S BUG, NOT A CRASH. A description that
            //names a node it never defined still draws the rest of the graph.
            if (from && to) from.connect(link.out || 0, to, link.in || 0);
        });

        return made;
    }

    function Graph({ nodes, links, height, onSelect }) {
        var host = useRef(null);
        var canvasRef = useRef(null);

        useEffect(function () {
            if (!host.current || !canvasRef.current) return;

            var graph = new LGraph();
            var canvas = new LGraphCanvas(canvasRef.current, graph);

            //litegraph draws a frame counter and a node tally over the top left
            //corner. It is a debugging aid for a graph being built, and this one
            //is finished before it is ever drawn.
            canvas.show_info = false;

            //READ, NOT EDIT — the same argument as ../editor. This is here to be
            //looked at, and a right-click menu offering to add a node is an
            //invitation to change a picture of something that cannot change.
            //Panning and dragging stay, because those are reading.
            canvas.allow_searchbox = false;
            canvas.allow_reconnect_links = false;
            canvas.render_canvas_border = false;
            canvas.background_image = null;
            canvas.clear_background_color = LOOK.background;
            canvas.default_link_color = LOOK.link;
            canvas.node_title_color = LOOK.text;
            canvas.getMenuOptions = function () { return []; };
            canvas.getNodeMenuOptions = function () { return []; };

            build(graph, nodes, links);

            if (onSelect) canvas.onSelectionChange = function (selected) {
                var first = null;
                for (var key in selected) { first = selected[key]; break; }
                onSelect(first ? first.__id : null);
            };

            //SIZED TO ITS BOX, AND A CANVAS HAS TWO SIZES. The css one stretches
            //whatever was drawn; the attribute one is how many pixels there are
            //to draw into, and litegraph hit-tests against it — so a mismatch is
            //a graph that looks soft and answers clicks in the wrong place.
            //
            //THROUGH LGraphCanvas.resize, NOT BY ASSIGNING canvas.width. This
            //started as the assignment, which looked equivalent and is not:
            //setting the attribute resets the 2d context, and litegraph keeps a
            //second background canvas that would have been left at the old size.
            //Its own resize() does both. (Measured: the direct assignment could
            //be deleted and every test still passed, which is what sent me
            //looking at what was really doing the work.)
            //
            //AND THE OBSERVER IS NOT OPTIONAL. litegraph only re-reads its box
            //when `autoresize` is on, and that is off here because it re-measures
            //on every mouse move. Nothing else follows the box.
            function measure() {
                var box = host.current;
                if (!box || !canvasRef.current) return;

                var w = Math.max(1, box.clientWidth);
                var h = Math.max(1, box.clientHeight);
                if (canvasRef.current.width == w && canvasRef.current.height == h) return;

                try { canvas.resize(w, h); } catch (e) { /* mid-teardown */ }
            }
            measure();

            var watching = null;
            if (typeof ResizeObserver == 'function') {
                watching = new ResizeObserver(measure);
                watching.observe(host.current);
            }

            return function () {
                if (watching) watching.disconnect();
                //STOPPED AND RELEASED, NOT LEFT. LGraphCanvas runs a
                //requestAnimationFrame loop and binds document-level mouse and
                //key listeners, so a page that mounted one of these per visit
                //would leave a render loop running per visit. The same reason
                //../editor destroys its ace instance.
                try { canvas.stopRendering(); } catch (e) { /* never started */ }
                try { graph.stop(); } catch (e) { /* was not running */ }
                try { canvas.setGraph(null); } catch (e) { /* already detached */ }
            };
            //REBUILT WHEN THE DESCRIPTION CHANGES, and only then. The nodes and
            //the links are the whole content; everything else about a graph is
            //interaction, and that happens inside it.
        }, [nodes, links]);

        //THE BOX IS THE CALLER'S AND MUST BE A DEFINITE ONE, exactly as in
        //../xterm: a canvas fills what it is given, and a container sized by its
        //own content gives it nothing to fill.
        return (
            <div className="graph" ref={host} style={{ height: height || 420, position: 'relative' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
        );
    }

    await register(null, {
        litegraph: {
            Graph: Graph,
            //THE LOOK, HANDED OUT RATHER THAN COPIED, as ../xterm does.
            LOOK: LOOK,
            //THE LIBRARY ITSELF, for the thing this component will not cover.
            //Nothing uses these yet; they are here so that needing one is not a
            //reason to reach into vendor/.
            LiteGraph: LiteGraph,
            LGraph: LGraph,
            LGraphCanvas: LGraphCanvas
        }
    });
}
module.exports = plugin;
