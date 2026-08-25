# core/pages

**The pages the app has**, and the one place anything can add one.

| file | provides | consumes |
|---|---|---|
| `window.js` | `pages` | — |

```
pages.add({ id, label, icon, Page, order })   -> { id, remove }
pages.remove(id)
pages.list          what is registered now, in order
pages.usePages()    the same, as a hook that re-renders when it changes
pages.onChange(fn)  -> unsubscribe
```

## why this exists

It was a literal array. [`demo/pages/index.js`](../../demo/pages/) said *adding a
page is a line here and a file beside it*, which was true, and was the wrong
shape for everything except the demo: **a plugin in
[`src/app_plugins`](../../../app_plugins/) could not add a page without editing
the demo** — and editing the app is the one thing a separable tree must not have
to do.

That was a real hole rather than a tidiness complaint. A whole feature could be
dropped in beside the app, resolved into the real graph, driven over ipc and
tested in all four contexts, and still have nowhere to appear on screen. The
answer to "can a third party extend this app" was *everywhere except the part
you can see*.

So the list is a service and the shell is not. Anything with a `window.js` can
say `consumes: ['pages']` and add one.

## what a shell owes a page, and what it does not

The demo renders whatever is registered, and passes exactly two things:

| prop | |
|---|---|
| `open(id)` | go to another page |
| `toast(message, opts)` | say something in the corner. **Optional** — a page must render without it |

**Everything else a page needs, it gets from the plugin that registered it.**
That is the cut that makes a third-party page possible at all: this file would
otherwise have to know what a page might want, and every new page would widen a
prop bag nobody owns. The demo closes over its own dozen services and hands them
to its own pages; [tts](../../../app_plugins/tts/) closes over `tts` and hands
that to its own.

## the details that are not arbitrary

**An `id` is a key, not a label.** Registering the same one twice replaces it.
The window bundle is rebuilt and re-run on every save, so a plugin that
registers on load would otherwise have three copies of its page in the sidebar
by lunchtime — the same reason [banner](../../ui/banner/) replaces by id.

**Order is a number, then arrival.** Sorting on the number alone would leave
ties broken by plugin load order, which falls out of the dependency graph — so a
page would move because *something else* gained a `consumes`, which is not a
thing anybody would think to look for. `order` defaults to **100**, not 0, so a
page that does not care lands after the ones that do: the app's own pages number
themselves, and a plugin adding one means "with the others", not "first".

**`add` hands back a handle.** The caller is usually a plugin whose teardown
wants to undo exactly what it did — `self.own(added.remove)`, with nothing named
twice.

**The hook belongs to the service.** Every shell would otherwise write the same
`useState`/`useEffect` pair, and the one that forgot would draw a sidebar that
never noticed a page arriving.

## deleting the demo

Leaves this working and nothing drawing it, which is the honest outcome rather
than a bug: **the registry is the contract, the sidebar is the demo's.** A
scaffold being turned into a real app replaces the shell, and every page
registered against this still arrives at the new one.

## it is core, not ui

Nothing here renders — there is no markup in the file and it consumes no theme.
It is the app's table of contents, in the same sense [tray](../tray/) owns a menu
that others add items to. The plugins under [`ui/`](../../ui/) are surfaces; a
shell that is not the demo's would replace the drawing and keep this.
