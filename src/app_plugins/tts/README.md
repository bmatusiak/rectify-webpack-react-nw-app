# tts

**Saying something out loud**, from either half of the app.

| file | provides | consumes |
|---|---|---|
| `window.js` | `tts` | `io`, `Plugin` |
| `server.js` | `tts` | `ipc`, `io`, `Plugin` |
| `cli.js` | — | `cli`, `ipc` |

Plus `speech.js`, which has no `provides` and is required by both halves: the
parts of speaking that are only text and arguments.

```
tts.speak(text, { voice, rate, pitch, volume, via, enqueue, max, file })
      -> { route: 'speech' | 'node', parts }
tts.voices()      what this machine can speak with
tts.able()        whether it can speak at all
tts.stop()        and pause() / resume(), in the window
tts.speaking      right now
```

```sh
node src/cli.js say "the build is done"
node src/cli.js voices
```

## one service, two implementations

The same shape as [io](../../app/core/io/), [ipc](../../app/core/ipc/) and
[window](../../app/core/window/): `tts` is provided in two contexts by two
files, and a plugin that wants to say something writes `consumes: ['tts']` once
and works in both.

| half | route | why it is the one there |
|---|---|---|
| the page | `window.speechSynthesis` | already in the page, needs no permission, no dependency and no process |
| the node half | a child process — SAPI, `say`, `espeak-ng` | it has no window, and this is the only route that can render speech to a **file** |

**They are not a downgrade of each other.** Both end at the same synthesizer —
SAPI 5 on windows, `AVSpeechSynthesizer` on macos, speech-dispatcher on linux.
Chromium ships no voices of its own; it asks the OS, exactly as the child
process does. So falling back is a change of door, not of voice.

**A page with no voices falls through to the node half**, over
[io](../../app/core/io/) with an ack, because `ipc` is main, server and cli and
the window is none of them. `via: 'node'` asks for that on purpose, which is
also the only way to exercise the fallback on a machine that has voices — see
[the tests](#the-tests).

## nw.js has no tts api, and the third door is not used

Three layers can speak here and all three end at the same OS synthesizer.
`chrome.tts` is the one this does not use: it wants a `"permissions": ["tts"]`
entry in package.json, it hands back the same voice pool `speechSynthesis`
already has, and its callback API would be wrapped back into promises in this
file anyway. Nothing is gained by asking the same synthesizer through a second
door — and an empty voice list in one is an empty voice list in the other, so it
is not a fallback either.

**The node route shells out rather than binding.** The alternative is a native
module — an FFI into SAPI, or one of the npm wrappers — which means a build
step, a prebuild per platform and per node version, and a compiler in the way of
`npm install`. What is being asked for is one line of powershell.

## the three things that are actually hard

None of them are the API. All three look like a broken machine.

**`getVoices()` is empty on the first call**, in every chromium build — that
call is what starts the fetch. Believing it is how an app decides it has no
voices half a second before it gets some. `window.js` waits for `voiceschanged`,
checks the list first in case that already fired, and gives up after three
seconds — an empty list *after* that is a real answer.

**An utterance is only weakly held by the queue.** A long one built as a local
variable can be collected while it is still being spoken: the audio stops mid
sentence and `end` never fires, so anything awaiting it waits forever. Utterances
are parked in a `Set` until they settle, which is the only reason that `Set`
exists.

**Text is cut at ~180 characters, on sentence boundaries.** Chromium's local
voices truncate somewhere past 200-250 per utterance and long speech stalls near
fifteen seconds — and the caller is never told, because `end` fires on the part
that *was* spoken. The other common fix is a watchdog calling `pause()` and
`resume()` every ten seconds; it works and it fights the queue, since every tick
races whatever the queue is doing. Cutting up front means nothing has to be
nudged. A sentence longer than the limit is still left whole: cutting mid word
to satisfy a number invented here would make the voice stumble over something
the punctuation never asked it to.

## the text is never part of the command

`powershell -Command "$s.Speak('" + text + "')"` is the obvious way to write the
node route and it is a hole — a quote or a `;` in whatever the app is reading
aloud ends the string and starts a statement. The text goes in the
**environment** on windows and after a bare `--` everywhere else, so nothing
between the app and the synthesizer can mistake it for an instruction.
`node.test.js` tries it, on all three platforms, with a string that would delete
a disk if it landed anywhere else.

## a reload has to take the voice with it

The node half is torn down and rebuilt on every save. A synthesizer spawned by
the build before this one goes on talking to a room where nothing is listening,
with no handle left anywhere to stop it — found by editing `server.js` while it
was mid sentence. Every child is held in a `Set` and killed on teardown, along
with the ipc handlers and the `connection` listener.

In the window it is the same problem through a different door: webpack
full-reloads the page whenever it cannot hot swap, and a queue left running
through a navigation **wedges** — the synthesizer accepts utterances afterwards
and speaks none of them until the app is restarted. `beforeunload` cancels.

## the tests

**Nothing in any of them makes a sound**, which is the constraint the whole
plugin was shaped around: a suite that speaks is a suite nobody runs twice.

- **`node.test.js`** — `speech.js`, in the test runner, in a millisecond: where
  a sentence ends, what `rate: 1.5` means to each synthesizer, and the injection
  attempt above. The two platforms this machine is not are asked as easily as
  the one it is.
- **`window.test.js`** and **`server.test.js`** — the routes themselves, inside
  the running app, at `volume: 0` and `rate: 2`. Volume 0 is a real utterance
  with a real voice attached: queued, spoken, `end` fires, nobody hears it. It
  reaches SAPI and espeak as a real volume too, which is why `node.test.js`
  checks that it survives into all three commands — the moment it stops doing so,
  those suites start talking.
- **`cli.test.js`** — `ipc.call` intercepted, so the terminal side is checked
  without reaching the app at all.

Listing voices is the one end-to-end check of the node route that is silent by
nature: it spawns the real synthesizer and reads back what it said.

## what this deliberately does not do

No UI. A voice picker, a rate slider and a Speak button belong to whoever is
building a page, and this tree may not add one to [demo](../../app/demo/) —
`src/app_plugins` is a feature the scaffold **offers**, and a plugin here that
edited the app to show itself off would be exactly the coupling the tree exists
to disprove. The cli is the demonstration.

No `file` support beyond passing it through: `speak(text, { file })` writes a
WAV instead of playing, on the node route only, because no Web Speech API can.
Nothing here plays it back — an `<audio>` element pointed at the result is three
lines in whatever page wants the audio to go through its own output routing.
