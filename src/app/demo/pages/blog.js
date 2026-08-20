var React = require('react');
var { useState } = React;

//bootstrap's blog example: a masthead, a featured post, a run of posts and a
//column down the side. The posts here are the app's own commit-shaped notes,
//and picking one in the sidebar actually opens it, which the example's links
//do not.

var POSTS = [
    {
        id: 'four-runtimes', tag: 'Architecture', tone: 'primary', icon: 'diagram-3',
        date: 'Four boots, one folder', title: 'A plugin is a folder',
        summary: 'The files inside it say where it runs: main.js, server.js, window.js, cli.js.',
        body: [
            'Nothing registers a plugin. The folder is the registry, and the filename is the runtime.',
            'A plugin that only answers on the control socket needs no cli.js at all, because anything the command table does not know is forwarded to the running app.'
        ]
    },
    {
        id: 'one-socket', tag: 'Transport', tone: 'success', icon: 'plug',
        date: 'socket.io and a named pipe', title: 'One socket each',
        summary: 'The window talks over socket.io. The terminal talks over a named pipe.',
        body: [
            'They are different problems. The window is a browser and has no node in it, so it gets the socket the page can open.',
            'The terminal is plain node with no window, so it gets a pipe and needs no dependency beyond net.'
        ]
    },
    {
        id: 'nothing-in-the-clear', tag: 'Packaging', tone: 'danger', icon: 'shield-lock',
        date: 'nwjc, and what it does not do', title: 'Nothing shipped in the clear',
        summary: 'The node half is compiled into main.bin. The window half is still readable, as all client code is.',
        body: [
            'It is not encryption, and the readme says so. The window half is delivered to a browser context to run.',
            'What it does buy is that the app runs the source it was meant to, and nothing else is on disk to swap.'
        ]
    }
];

module.exports = function Blog(props) {
    var { theme, appPackage, toast } = props;
    var { Masthead, FeaturedPost, Post, Aside, Button, Badge, Icon, Pagination } = theme.ui;

    var [open, setOpen] = useState(POSTS[0].id);
    var [page, setPage] = useState(1);

    var current = POSTS.filter(function (p) { return p.id === open; })[0] || POSTS[0];
    var rest = POSTS.filter(function (p) { return p.id !== open; });

    return (
        <>
            <Masthead
                brand={appPackage.title}
                left={<span className="text-body-secondary">{POSTS.length} posts</span>}
                right={
                    <>
                        <Button size="sm" outline variant="secondary" icon="search"
                            onClick={function () { toast('there is nothing to search yet', 'secondary'); }} />
                        <Button size="sm" variant="primary" icon="bell"
                            onClick={function () { toast('subscribed to nothing', 'primary', 'bell'); }}>
                            Subscribe
                        </Button>
                    </>
                } />

            <div className="my-4">
                <FeaturedPost post={current} onOpen={function (p) { setOpen(p.id); }} />
            </div>

            <div className="row g-5">
                <div className="col-md-8">
                    <h3 className="pb-3 mb-4 fst-italic border-bottom text-body-emphasis">
                        {current.tag}
                    </h3>

                    <Post title={current.title} meta={current.date}>
                        {current.body.map(function (para, i) {
                            return <p key={i} className={i === 0 ? 'lead' : ''}>{para}</p>;
                        })}
                        <blockquote className="blockquote">
                            <p>{current.summary}</p>
                        </blockquote>
                    </Post>

                    {rest.map(function (p) {
                        return (
                            <Post key={p.id} title={p.title} meta={p.date}>
                                <p className="mb-2">{p.summary}</p>
                                <Button size="sm" outline variant="secondary"
                                    onClick={function () { setOpen(p.id); }}>Read this one</Button>
                            </Post>
                        );
                    })}

                    <Pagination page={page} pages={3} onSelect={function (n) {
                        setPage(n);
                        toast('page ' + n + ', which holds the same three posts', 'secondary');
                    }} />
                </div>

                <div className="col-md-4">
                    <Aside
                        about={'Everything on this page is a component in src/app/theme. The posts are real notes about ' + appPackage.name + '.'}
                        groups={[
                            {
                                title: 'Posts',
                                items: POSTS.map(function (p) { return { label: p.title, id: p.id }; }),
                                onSelect: function (item) { setOpen(item.id); }
                            },
                            {
                                title: 'Elsewhere',
                                items: [{ label: 'nw.js' }, { label: 'bootstrap' }, { label: 'rectify' }],
                                onSelect: function (item) { toast('no link, it is a demo: ' + item.label, 'secondary'); }
                            }
                        ]} />
                </div>
            </div>
        </>
    );
};
