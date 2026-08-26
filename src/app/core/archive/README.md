# core/archive

**Where files are kept, and how they are read back.** Not what any of them mean.

| file | provides | consumes |
|---|---|---|
| `main.js` | `archive` | `dataDir`, `state`, `log` |
| `server.js` | `archive` | `app` |

Plus `filing.js` (what may become a file, and how big) and `tar.js` (what is
inside an archive), neither of which has a `provides`.

```js
var runs = archive.store('runs');

runs.keep('report.txt', bytes, 'where it came from');   //-> { file, bytes, kept } | { refused }
runs.read('report.txt');                                //-> { text } | { entries } | { refused }
runs.list();                                            //newest first
```

```
runs.has(file)   runs.forget(file)   runs.bytes   runs.where
runs.empty()     everything in it, the drawer stays
runs.drop()      and the drawer too
```

```js
archive.here.store('runs')   //the open namespace's, refusing when there is none
archive.stores()             //what drawers exist
archive.nameIsOk(name)       //askable before anything is kept
```

```
archive.MOST       the most one file may be: 256MB
archive.READABLE   the most `read` will hand back: 2MB
```

Both are readable so a caller can decide **before** it takes the bytes —
*"I will accept this if you can store it"* is a question that cannot be asked
after the fact.

## it completes a set rather than starting one

| | | |
|---|---|---|
| [`state`](../state/) | the app's own things | json documents, readable |
| [`secret`](../secret/) | the ones worth hiding | sealed where it can be |
| **`archive`** | **files** | bytes somebody handed over |

**The difference is not importance, it is shape.** A build somebody produced, a
report, an image, a log a machine printed — none of those is a document to read
and write whole, and putting one in `state` means keeping a megabyte of base64
inside a json file that something rewrites on every change.

## reading one back is part of keeping it

So the refusals live here, and each says its number:

| | |
|---|---|
| a binary | refused, rather than rendered as replacement characters — which reads as corruption instead of *this is not text* |
| something enormous | refused with its size, and where to open it instead |
| an archive | **looked inside**, without being unpacked anywhere |

A caller that only gets bytes back has to invent all three, and the second app to
do that will invent them differently.

## nothing that arrives here is trusted

A document name in [`state`](../state/) is chosen by a plugin in this app. **A
file name arrives with the bytes**, from wherever they came from.

So the rule is an **allow list**, not a hunt for every spelling of `..` — a name
either matches or it is not a name. Being sure you thought of every traversal is
not a thing anybody manages twice.

**A refusal is a sentence, not a boolean**, because the caller has to tell
whoever sent the bytes why, and `false` is not something anybody can act on. And
it is an *answer* rather than a throw: everything that can go wrong here is
something to explain, and an exception is the shape that makes a caller either
swallow it or crash. The one exception is a bad name passed to `store()` — that
is a bug in this app, not a fact about the bytes.

## why there is no vendored tar

The app this came from vendors **nanotar** — 326 lines, MIT, a perfectly good
library — to answer exactly one question: *what is in this thing somebody handed
back*. Half of what it carries writes tars, which nothing here does.

A tar is a sequence of 512-byte headers, each followed by its file's bytes
rounded up to 512. Listing what is in one is a loop over that, and the honest
version is shorter than the licence file. So [`tar.js`](tar.js) reads, **refuses
what it does not understand, and says which**:

| | |
|---|---|
| understands | `ustar` in both spellings; files, directories, and the `prefix` field that carries the first part of a long path |
| refuses by name | PAX extended headers, GNU long-name records |

Both of those store the real name in a *preceding* entry, so a reader that
ignored them would list `././@PaxHeader` and a truncated name and call that the
contents. **Saying "this cannot read that" is the difference between a limit and
a lie** — and a partial listing is the dangerous shape here, because it looks
exactly like a small archive.

`node.test.js` builds its archives with the **real `tar`** — Windows has shipped
bsdtar as `tar.exe` since Windows 10, and every other platform has one. A reader
tested against a writer of my own would agree with itself about a format neither
had read correctly.

## two things the tests could not see until they were forced

**A size field is octal, in ASCII** — the one thing about tar that surprises
everybody. `hello` is five bytes, and `000000000005` reads as five in either
base, so the whole suite passed against a reader that had it wrong. Eight is the
first size where the two differ; the fixture is twenty bytes now.

**The `prefix` field only appears for a path too long for the 100-character name
field.** A short nested path fits in `name`, so dropping the prefix looked
correct until the fixture had a path long enough to need one.

Both were found by their own sabotages surviving.

## the namespaced half

`archive.here.store(name)` is the same shape as [`state`](../state/)'s `here`,
and for the same reason: **what a namespace produced belongs with that
namespace.** Point the app at a second one and the first one's files are not
sitting there, about work that is not in front of you.

It asks `state` rather than keeping its own answer — two plugins each deciding
which namespace is open is the disagreement `follow` exists to prevent, and a
second copy would be the first thing to drift.

## the server half refuses

It belongs with [`state`](../state/) rather than with [`cached`](../cached/) on
this question.

A cache with nowhere to write is a cold cache: nothing is lost, because
everything in it can be worked out again. **What is kept here cannot.** It is
bytes somebody handed over, and a stand-in writing to a temp folder would report
every keep as a success and lose the lot at the next reboot.

`nameIsOk` still answers, because it is text and has nothing to do with a folder.
