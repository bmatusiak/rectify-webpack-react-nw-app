# tray

The tray icon, and the menu other plugins add to.

| file | provides | consumes |
|---|---|---|
| `main.js` | `tray` | `app`, `http`, `window`, `lifecycle` |
| `server.js` | `tray` | `app` |

```
tray.add(options)   an nw.MenuItem. returns { remove() }
tray.labels()       what is on it now
tray.available      false if the platform would not give us one
tray.start()        called by src/boot.js, once there is a url for the tooltip
```

**This is what makes closing the window survivable.** Without somewhere to
reopen from, hiding a window would strand the app with no way back — which is
why `window.closeShouldHide(true)` is only switched on once an icon actually
exists.

## adding to it

```js
//src/app/my-thing/server.js
plugin.consumes = ['tray'];

async function plugin(imports, register) {
    var item = imports.tray.add({
        label: 'Say hello in the log',
        click: function () { console.log('hello'); }
    });

    //all of nw.MenuItem's options work: type, checked, enabled, tooltip,
    //icon, submenu, key, modifiers

    await register(null, { onDestroy: function () { item.remove(); } });
}
```

**Give the item back on teardown** and a reload cannot leave a second copy
behind. The menu is **rebuilt whole rather than patched**: plugins come and go on
every reload, and removing by index is how menus end up with the wrong item on
them. Items added before the tray exists are applied when it does.

The stock items are **Open window**, **Open in browser**, and **Quit**.

## the icon path is relative, and that matters

`nw.Tray` resolves it against the app, so the same value works from the source
tree and from inside a package.

Watch for it. **An icon path that does not resolve is not an error** —
`new nw.Tray()` succeeds, the menu works, and you get an invisible entry in the
notification area. It cost a while to notice, and longer to believe.

`tray` is module scope on purpose: a collected `Tray` takes its icon with it.

## platform differences

Left click opens the window on windows and linux. On mac the menu is the only
interaction, so the same actions live in it. If no tray can be created at all,
that is logged and `closeShouldHide` is never switched on — closing the window
quits, which is the honest behaviour when there is no way back.

## in a package

**Open in browser** is absent: nothing is served, so there is no page to open.
[devtools](../devtools/) drops its two items in the same build, for the stronger
reason that compiling the node half into `main.bin` is pointless if a menu item
opens a console onto it.

## the server half

`tray/server.js` wraps a controller handed over from main and owns only what it
added, because the icon has to outlive the bundle that is being thrown away.
Both are always there, so a `server.js` can use `tray` without asking.
