var React = require('react');

//THE GRAPH, IN A REAL WINDOW.
//
//A canvas has two sizes and litegraph reads the attribute one to hit-test, so
//"is it the right size" is the question that decides whether a click lands where
//the cursor is. Neither size exists outside a laid-out document.

plugin.consumes = ['selftest', 'litegraph'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert, mount } = imports.selftest;
    var litegraph = imports.litegraph;

    var NODES = [
        { id: 'a', title: 'a', inputs: [], outputs: ['thing'], pos: [20, 20] },
        { id: 'b', title: 'b', inputs: ['thing'], outputs: ['other'], pos: [220, 20] },
        { id: 'c', title: 'c', inputs: ['other'], outputs: [], pos: [420, 20] }
    ];
    var LINKS = [
        { from: 'a', out: 0, to: 'b', in: 0 },
        { from: 'b', out: 0, to: 'c', in: 0 }
    ];

    describe('the graph, in a real window', function () {

        it('hands out a component, the colours, and the library', function () {
            assert.equal(typeof litegraph.Graph, 'function');
            assert.equal(typeof litegraph.LOOK, 'object');
            assert.ok(litegraph.LOOK.background, 'no background colour');

            //THE LIBRARY LOADED AT ALL, which is not a given: it is
            //`(function (y) { ... })(this)`, and babel rewriting a top-level
            //`this` to undefined would throw on its first line. webpack.config.js
            //keeps vendor/ away from babel, and this is what says so.
            assert.equal(typeof litegraph.LiteGraph, 'object');
            assert.equal(typeof litegraph.LGraph, 'function');
            assert.equal(typeof litegraph.LGraphCanvas, 'function');
            assert.ok(litegraph.LiteGraph.registered_node_types, 'LiteGraph did not initialise');
        });

        //A CANVAS INHERITS NOTHING EITHER. litegraph paints every pixel itself,
        //so there is no cascade to take a colour from and the whole palette has
        //to be handed over -- the same shape as ../markdown's iframe.
        it('carries two palettes, and defaults to dark', function () {
            assert.equal(typeof litegraph.look, 'function');
            assert.ok(litegraph.LOOKS.dark, 'no dark palette');
            assert.ok(litegraph.LOOKS.light, 'no light palette');

            assert.equal(litegraph.look('nonsense'), litegraph.LOOKS.dark);
            assert.equal(litegraph.look(), litegraph.LOOKS.dark);
            assert.equal(litegraph.look('light'), litegraph.look('light'));

            assert.notEqual(litegraph.LOOKS.dark.background, litegraph.LOOKS.light.background);
            assert.notEqual(litegraph.LOOKS.dark.text, litegraph.LOOKS.light.text);
        });

        it('paints the canvas in the palette it was given', async function () {
            async function groundOf(look) {
                var view = await mount(React.createElement(litegraph.Graph, {
                    nodes: NODES, links: LINKS, height: 300, look: look
                }));
                try {
                    var canvas = view.find('canvas');
                    for (var i = 0; i < 10; i++) await view.painted();

                    //AVERAGED, NOT SAMPLED AT A CORNER. The first version read
                    //one pixel at (2,2) and got zero from both palettes:
                    //litegraph paints its background on a second canvas and
                    //blits it, so a corner is not reliably anything. The mean of
                    //the whole surface is, and it is the ground that dominates
                    //it either way.
                    var data = canvas.getContext('2d')
                        .getImageData(0, 0, canvas.width, canvas.height).data;

                    var total = 0;
                    for (var p = 0; p < data.length; p += 4) total += data[p] + data[p + 1] + data[p + 2];
                    return total / (data.length / 4);
                } finally { view.unmount(); }
            }

            var dark = await groundOf(litegraph.look('dark'));
            var light = await groundOf(litegraph.look('light'));

            assert.ok(light > dark, 'the light ground (' + light + ') is not lighter than the dark one (' + dark + ')');
        });

        it('draws into a canvas sized to its box', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES, links: LINKS, height: 300
            }));

            try {
                var canvas = view.find('canvas');
                assert.ok(canvas, 'no canvas was rendered');

                var box = view.find('.graph').getBoundingClientRect();
                assert.ok(box.width > 100, 'the host box never got a width');

                //THE ATTRIBUTE SIZE, NOT THE CSS ONE. The css size stretches
                //whatever was drawn; this one is how many pixels there are to
                //draw into, and litegraph hit-tests against it. Setting only the
                //css size gives a graph that looks blurry and clicks in the
                //wrong place.
                assert.ok(canvas.width > 100,
                    'canvas.width is ' + canvas.width + ': only the css size was set');
                assert.ok(Math.abs(canvas.width - box.width) < 4,
                    'canvas.width ' + canvas.width + ' does not match the box ' + Math.round(box.width));
                assert.ok(canvas.height > 100, 'canvas.height is ' + canvas.height);
            } finally {
                view.unmount();
            }
        });

        //A GRAPH THAT GROWS SHOULD NOT BE CUT OFF AT THE BOTTOM.
        //
        //Without `fit` the caller guesses: the same height for four nodes and
        //for thirty, so one is mostly empty and the other loses its bottom row
        //with nothing on screen to say there is more. The nodes know where they
        //ended up.
        it('fits its box to the graph when asked, and not otherwise', async function () {
            var tall = [];
            for (var i = 0; i < 12; i++) {
                tall.push({ id: 'n' + i, title: 'n' + i, inputs: [], outputs: [], pos: [20, 20 + i * 110] });
            }

            var fixed = await mount(React.createElement(litegraph.Graph, {
                nodes: tall, links: [], height: 300
            }));
            var fitted = await mount(React.createElement(litegraph.Graph, {
                nodes: tall, links: [], height: 300, fit: true
            }));

            try {
                for (var f = 0; f < 5; f++) { await fixed.painted(); await fitted.painted(); }

                var asked = fixed.find('.graph').getBoundingClientRect().height;
                var grown = fitted.find('.graph').getBoundingClientRect().height;

                assert.ok(Math.abs(asked - 300) < 4, 'the unfitted one is ' + Math.round(asked) + ', not 300');
                assert.ok(grown > asked + 200,
                    'twelve rows of nodes fitted into ' + Math.round(grown) + 'px');
            } finally {
                fixed.unmount();
                fitted.unmount();
            }
        });

        //AND `height` IS THE FLOOR, so a nearly empty graph does not collapse
        it('does not shrink below the height it was given', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: [NODES[0]], links: [], height: 400, fit: true
            }));

            try {
                for (var i = 0; i < 5; i++) await view.painted();
                var tall = view.find('.graph').getBoundingClientRect().height;
                assert.ok(tall >= 396, 'one node collapsed it to ' + Math.round(tall) + 'px');
            } finally { view.unmount(); }
        });

        //IT FOLLOWS ITS BOX, WHICH IS THE PART NOTHING ELSE DOES.
        //
        //litegraph re-reads its container only when `autoresize` is on, and that
        //is off here because it re-measures on every mouse move. So the size at
        //mount proves nothing about the size after a resize -- litegraph sets it
        //once at construction either way, which is exactly why removing the
        //observer left every other assertion here passing.
        it('follows its box when the box changes', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES, links: LINKS, height: 300
            }), { width: '900px' });

            try {
                var canvas = view.find('canvas');
                for (var i = 0; i < 5; i++) await view.painted();
                var first = canvas.width;
                assert.ok(first > 100, 'never sized at all (' + first + ')');

                view.el.style.width = '500px';
                for (var j = 0; j < 20; j++) await view.painted();

                assert.ok(canvas.width < first - 100,
                    'the box went from 900px to 500px and the canvas stayed at ' + canvas.width);
                assert.ok(Math.abs(canvas.width - view.find('.graph').getBoundingClientRect().width) < 4,
                    'the canvas and its box disagree by more than a rounding error');
            } finally {
                view.unmount();
            }
        });

        //SOMETHING WAS ACTUALLY PAINTED. A canvas of the right size that draws
        //nothing looks identical to a working one in every assertion above, so
        //this reads a pixel back: the graph's own background is not the page's.
        it('paints, rather than leaving an empty canvas', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES, links: LINKS, height: 300
            }));

            try {
                var canvas = view.find('canvas');
                for (var i = 0; i < 10; i++) await view.painted();

                var ctx = canvas.getContext('2d');
                var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                var lit = 0;
                for (var p = 3; p < pixels.length; p += 4) if (pixels[p] > 0) lit++;
                assert.ok(lit > 1000, 'only ' + lit + ' pixels were painted: the canvas is blank');
            } finally {
                view.unmount();
            }
        });

        //A DESCRIPTION IN, A GRAPH OUT — ASKED THROUGH THE FRONT DOOR.
        //
        //The first version of this read LGraphCanvas.active_canvas and counted
        //_nodes, which is reaching around the very interface this plugin exists
        //to provide: it would keep passing if `nodes` were ignored and the graph
        //were built some other way, and it broke the moment that global was not
        //what it was guessed to be.
        //
        //So it clicks instead. A node put at a known position is clicked at that
        //position, and onSelect has to name it. That proves three things at once
        //— the description was understood, the node was placed where it was
        //asked for, and the canvas's ATTRIBUTE size matches its css size, since
        //litegraph hit-tests against the first and the browser delivers the
        //click in terms of the second.
        it('places a node where it was asked to, and knows what was clicked', async function () {
            var picked = [];
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES, links: LINKS, height: 300,
                onSelect: function (id) { picked.push(id); }
            }));

            try {
                var canvas = view.find('canvas');
                for (var i = 0; i < 5; i++) await view.painted();

                var rect = canvas.getBoundingClientRect();

                //litegraph's pos is the top-left of the node BODY, with the
                //title bar above it — so a few pixels in and down is inside.
                function clickNode(node) {
                    var x = rect.left + node.pos[0] + 30;
                    var y = rect.top + node.pos[1] + 10;

                    ['mousedown', 'mouseup', 'click'].forEach(function (type) {
                        canvas.dispatchEvent(new MouseEvent(type, {
                            bubbles: true, cancelable: true, view: window,
                            button: 0, buttons: type === 'mousedown' ? 1 : 0,
                            clientX: x, clientY: y
                        }));
                    });
                }

                clickNode(NODES[1]);
                await view.painted();

                assert.ok(picked.length, 'clicking a node selected nothing at all');
                assert.equal(picked[picked.length - 1], NODES[1].id);

                clickNode(NODES[2]);
                await view.painted();
                assert.equal(picked[picked.length - 1], NODES[2].id);
            } finally {
                view.unmount();
            }
        });

        //AND MORE OF A DESCRIPTION IS MORE ON THE SCREEN. A cheap second opinion
        //on the same question that does not depend on where anything was put.
        it('draws more when there is more to draw', async function () {
            async function painted(nodes, links) {
                var view = await mount(React.createElement(litegraph.Graph, {
                    nodes: nodes, links: links, height: 300
                }));
                try {
                    var canvas = view.find('canvas');
                    for (var i = 0; i < 10; i++) await view.painted();

                    var data = canvas.getContext('2d')
                        .getImageData(0, 0, canvas.width, canvas.height).data;

                    //the background is painted everywhere, so alpha says nothing
                    //here; count pixels that are not the background colour
                    var drawn = 0;
                    for (var p = 0; p < data.length; p += 4) {
                        if (data[p] > 40 || data[p + 1] > 40 || data[p + 2] > 60) drawn++;
                    }
                    return drawn;
                } finally {
                    view.unmount();
                }
            }

            var one = await painted([NODES[0]], []);
            var all = await painted(NODES, LINKS);

            assert.ok(all > one, 'three nodes and two links drew no more than one node (' + all + ' vs ' + one + ')');
        });

        it('draws the rest of the graph when a link names a node that is not there', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES,
                links: LINKS.concat([{ from: 'a', out: 0, to: 'nowhere', in: 0 }]),
                height: 300
            }));

            try {
                assert.ok(view.find('canvas'), 'a missing link end took the whole graph down');
            } finally {
                view.unmount();
            }
        });

        //STOPPED AND RELEASED. LGraphCanvas runs a requestAnimationFrame loop
        //and binds document-level listeners; a page that mounted one per visit
        //would leave a render loop running per visit.
        it('takes its canvas with it when it goes', async function () {
            var view = await mount(React.createElement(litegraph.Graph, {
                nodes: NODES, links: LINKS, height: 300
            }));
            assert.ok(view.find('canvas'), 'never mounted');

            view.unmount();
            assert.equal(view.find('canvas'), null);
        });
    });

    register();
}
module.exports = plugin;
