//the demo's pages, in sidebar order. adding one is adding a line here and a
//file beside it.

module.exports = [
    { id: 'system', label: 'System', icon: 'cpu', Page: require('./system') },
    { id: 'buttons', label: 'Buttons', icon: 'ui-radios', Page: require('./buttons') },
    { id: 'forms', label: 'Forms', icon: 'input-cursor-text', Page: require('./forms') },
    { id: 'data', label: 'Data', icon: 'table', Page: require('./data') },
    { id: 'overlays', label: 'Overlays', icon: 'window-stack', Page: require('./overlays') },
    { id: 'disclosure', label: 'Disclosure', icon: 'chevron-expand', Page: require('./disclosure') },
    { id: 'layouts', label: 'Layouts', icon: 'columns-gap', Page: require('./layouts') },

    //the page-shaped ones, straight out of bootstrap's own examples folder
    { id: 'dashboard', label: 'Dashboard', icon: 'speedometer2', Page: require('./dashboard') },
    { id: 'checkout', label: 'Checkout', icon: 'bag-check', Page: require('./checkout') },
    { id: 'blog', label: 'Blog', icon: 'file-text', Page: require('./blog') },
    { id: 'cover', label: 'Cover', icon: 'stars', Page: require('./cover') },
    { id: 'cheatsheet', label: 'Cheatsheet', icon: 'palette', Page: require('./cheatsheet') },

    //the vendored surfaces, one page each. every one of these is a plugin of
    //its own under src/app/ui with its own vendor folder, so deleting one
    //deletes a page and nothing else
    { id: 'editor', label: 'Editor', icon: 'file-earmark-code', Page: require('./editor') },
    { id: 'markdown', label: 'Markdown', icon: 'markdown', Page: require('./markdown') },
    { id: 'terminal', label: 'Terminal', icon: 'terminal', Page: require('./terminal') },
    { id: 'graph', label: 'Graph', icon: 'diagram-3', Page: require('./graph') }
];
