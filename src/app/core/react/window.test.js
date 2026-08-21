//react's root, from inside the page it mounted into. Whether it mounted at all
//is not a question a test process can ask -- there is no document for it to
//have mounted into.

plugin.consumes = ['selftest', 'react'];
plugin.provides = [];
function plugin(imports, register) {
    var { describe, it, assert } = imports.selftest;
    var react = imports.react;

    describe('react, in the page', function () {

        it('has a root to render into', function () {
            assert.ok(react.root, 'no root');
            assert.equal(typeof react.root.render, 'function');
        });

        it('mounted into the element the html actually has', function () {
            var mount = document.getElementById('root');
            assert.ok(mount, 'no #root in the document');
            assert.ok(mount.children.length > 0, 'nothing was rendered into it');
        });

        it('rendered the app, not merely something', function () {
            //the shell is the proof: a frame, a sidebar and a scrolling pane
            assert.ok(document.querySelector('.app-sidebar'), 'no sidebar');
            assert.ok(document.querySelector('main'), 'no main');
            assert.ok(document.querySelector('.navbar'), 'no navbar');
        });
    });

    register();
}
module.exports = plugin;
