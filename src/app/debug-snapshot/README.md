# debug-snapshot

What the window looks like and what it is made of, at one moment. **Delete this
folder and the commands, the key, the banner and the guard all go with it.**

| file | provides | consumes |
|---|---|---|
| `main.js` | — | `ipc`, `window`, `bridge`, `may`, `log`, `dataDir` |
| `window.js` | — | `io`, `banner` |
| `cli.js` | — | `cli`, `ipc` |

```sh
node src/cli.js snapshot          # both halves, named the same, into the data dir
node src/cli.js snapshot bug      # ... as bug.png and bug.html, where you are
node src/cli.js markup            # the markup on its own
```

`Ctrl+Shift+D` in the window does the same thing and raises a banner with the two
paths and a button to copy them.

## two files, because they answer different halves of one question

**A class that matches no rule is invisible in the picture and obvious in the
markup**; a value drawn from the wrong field is the other way round. CSS has no
undefined-name error, which makes a misspelt class the quietest failure this app
has — and the markup is the only place it shows.

**Of the same moment, which is the whole reason this plugin exists.** Both halves
were already here: `capture` in [`core/window`](../core/window/) and a `markup`
command beside it. Anybody wanting both took two snapshots, of two different
instants, and compared a pair that describes two windows. The app this idea came
from names it exactly — *"using it directly gets you half the answer and no sign
that the other half was available"*.

## it is not the other camera

That app has two, and they are unrelated. One photographs a page over the
devtools socket; the other photographs a **VirtualBox guest's desktop** with
`VBoxManage controlvm <name> screenshotpng`, because a machine that is powered on
and not dialled in is either still booting or wedged and the picture of its
console is the only way to tell which. Only the first has anything to do with
this. There is no virtual machine here.

## half an answer is still an answer

A minimized window has markup and no picture. A page that never rendered has a
picture and no markup. **Both cases return what there was and name what was
missing**, because refusing both because one failed fails hardest in exactly the
situations somebody reaches for this. Neither half is the only skip.

## what stays in core/window, and why the split is there

`window.markup()` reads the page, `window.styles()` reads its css, and
`window.capture()` photographs it. Those are capabilities of a window. **Writing
them down, guarding that, naming the pair and offering the paths is a feature**,
and a debugging tool that cannot be deleted cleanly is the wrong kind of tool.

It is the same line the app this came from draws: `windowShot` lives in its core
and only the pairing is in the deletable folder.

## the saved page opens on its own

The document carries `<link>` tags pointing at the dev server, and **that port is
gone the moment the app is** — so a file that relied on them renders unstyled the
first time somebody moves it or opens it tomorrow, which is exactly what somebody
does with it. In a package there is no server at all. Unstyled markup answers
none of the questions the picture could not, which is the whole reason for
writing two files.

So the stylesheets are read as **rules** rather than copied as files — `cssRules`
is what the browser actually applied, after the swatch was chosen and the mode
followed it — and inlined into the head.

**Added rather than substituted.** The dead `<link>` stays: the markup is meant to
be what the page *was*, a link that was there is a fact about the page, and
quietly deleting it would make the file disagree with the app it came from. A
later `<style>` simply wins.

## it is main's, not the node half's

The node half is rebuilt and re-run on every save, and **the page worth reading
is usually the one that failed to render** — where the node half may be exactly
what failed. So this asks main's own window controller for both halves and writes
them itself, rather than going through `capture` in
[`core/window/server.js`](../core/window/server.js), which dies with that bundle.

## it copies the whole screen to a file, so it is guarded

`snapshot` is declared with [`may`](../core/may/), and both commands go through
it. **One capability rather than two** — a person answering about the markup and
then again about the picture is being asked twice about one act.

A press of `Ctrl+Shift+D` carries `event.isTrusted`, so a person gets their
snapshot without being asked to confirm what they just did, and the same message
arriving from something driving the window raises the question instead. One rule,
and this plugin does not get its own version of it.

**The scrub is not a guarantee, and the picture has none at all.** The markup
goes through the [`durable`](../core/log/looks-like.js) rules, which catch what
has a *shape* — a token, a long random run, the tail of a URL. A short, plain
secret on the page survives. The picture is a photograph: a secret on screen is a
secret in the png unless it is a password field.

**They land in the [data dir](../core/dataDir/), not in the repository.** It was
`shots/` in the project root, which is gitignored — and *gitignored is not the
same as safe*. These files hold whatever was on the screen, in cleartext, and a
repository is the one folder a person routinely copies wholesale: a zip of it, a
`git add -f`, an editor that indexes everything, somebody else's `.gitignore`
after a merge.

The data dir is where everything else the app writes already lives — the state,
the cache, the record, the decisions — it is outside the repository entirely, and
it follows the profile, so a snapshot taken in one workspace does not turn up in
another's folder. They are still **unencrypted files on disk**, and still the
right thing to delete after reading.

A name given on the command line lands **where you are standing**; only the
default moved, and the answer prints the full path either way.

**`capture` in `core/window` is not guarded and never was**, so deleting this
folder does not lock the picture away; it removes the pair, the guard and the
key. That is worth knowing before assuming the guard is the only door.

## the clipboard is offered, never taken

The app this came from used to take it, and it took a quarter of a megabyte of
markup silently — in place of whatever somebody was carrying between two windows,
for a file that was already on disk. What is worth copying is the two paths,
which is a button on the banner.

That button is why [`ui/banner`](../ui/banner/) grew a `does` option. The
alternative was for this plugin to draw its own bar, which would make a debugging
tool the only thing in the app that knows what a notice looks like — and
undeletable without a search. A banner with a button is an ordinary thing any
plugin may want, which is the test of whether a seam is a seam or a special case.
