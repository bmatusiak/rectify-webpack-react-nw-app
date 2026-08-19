var React = require('react');

async function navbar(imports) {
    var { theme, $ } = imports;
    var { themeSwitcher } = theme;
    return function NavBar(props) {
        var { title, back_title, back_action, sub_title } = props;

        if (!title)
            return (<><style>{`body { padding-top: 1.5rem; }`}</style></>);

        $('title').text(imports.appPackage.title + ' | ' + title + (sub_title ? ' - ' + sub_title : ''));

        return (<>
            <nav className="navbar">
                <div className="container-fluid">
                    <div className="navbar-nav flex-row gap-2">

                        <a role="button" className="nav-link fw-bold " onClick={() => { }} >{title}</a>
                        &nbsp;
                        <button className="btn btn-primary" onClick={() => {
                            if (back_action) back_action();
                        }}>{back_title || ''}</button>
                    </div>
                    <div className='flex-grow-1 text-center flex-nowrap'>{sub_title || ''}</div>
                    <div className='text-center flex-nowrap'>
                        <button className='btn btn-primary' onClick={() => {
                            themeSwitcher()
                        }}><svg className="bi"><use xlinkHref="#moon-stars" /></svg></button>
                    </div>
                </div>
            </nav>
        </>)
    }
}
module.exports = navbar;