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
    { id: 'cheatsheet', label: 'Cheatsheet', icon: 'palette', Page: require('./cheatsheet') }
];
