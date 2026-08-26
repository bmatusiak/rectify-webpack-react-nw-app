# core/events

**What this app has done, kept across restarts.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `events` | `log`, `dataDir`, `ipc` |
| `server.js` | `events` | `app` |

Plus `keeping.js`, which has no `provides`: which lines are acts, and what may
not survive inside one.

```
node src/cli.js events                     what happened
node src/cli.js events '{"since":42}'      and only what happened after that
```

```js
events.all({ since, limit, tag })   //newest last
events.where                        //the file
events.kept                         //is any of this really being written down
events.policy                       //what this app records
```

```
events.worthKeeping(entry)   would this line be recorded -- askable before writing one
events.scrub(text)           what it would look like written down
events.keep(entry)           taken by core/log through `keeper`; call it yourself only
                             if you are not writing a log line at all
events.clear()               throw the record away
```

**Nothing calls `events.keep` directly.** It arrives through [`log`](../log/)'s
`keeper` seam, so a plugin records an act by writing a log line and nothing has
to know this exists.

## it is the other half of a decision core/log made

[`log`](../log/) deliberately does not do this, and its header says why: command
output goes through it, command output carries sign-in URLs and tokens being
placed, and a file of that is a credential store nothing treats as one.

That decision stands. This is the half it asks for — **redaction at the
boundary, and a decision about where it lives** — and it arrives through the one
seam that file leaves open rather than through an append call added next to a
logger.

## it is not a second log

| | holds | answers |
|---|---|---|
| [`log`](../log/) | thousands of lines, in memory | what is happening |
| **`events`** | hundreds, on disk | what was **done** |

**Anything that makes, destroys, starts or stops something.** This app restarts
every few minutes while it is being worked on, and everything before the restart
went with it — so *"I restarted it, then changed the config"* left no trace of
either, and anybody reading afterwards filled the gap with what they expected.

## the policy is the app's

```js
//src/config.js
events: {
    keep:  ['app', 'cron', 'demo', 'example'],
    never: ['connection', 'connect', 'disconnect', 'data', 'tick', 'ping', 'probe', 'out'],
    most:  2000
}
```

The app this came from hardcodes its own vocabulary — `task`, `queue`, `vm`,
`github` — **in the plugin**. That is an app's logic living in core, and it is
why the list could not be carried over: nothing in this scaffold has a `vm`. So
the shape is here and the words are in `src/config.js`, keyed by service name
like every other plugin's.

**An allowlist, so adding a logger somewhere new does not silently start writing
to disk.** Somebody has to decide a tag belongs.

## `never` is asked first, and that order was paid for

A line carries several tags. The app this came from checked its allowlist first
and had a deny list it never reached — a socket entry is tagged
`['vm', <name>, 'channel']`, so `vm` being kept let every one of them through.

**89 of 400 rows were one poll saying "reading its runs"**, and the answer to
*what happened to runner1 while I was away* had scrolled out of the file. A
record that keeps the heartbeat and drops the acts is worse than none, **because
it is trusted**.

## the count is what a bookmark is made of

`at` is milliseconds, and two acts in one millisecond is not a rare case — a
plugin that stops one thing and starts another writes both immediately.
Bookmarking on a timestamp then loses the second of them **for ever**: it is not
greater than the mark, so it never comes back, and a watcher following along
never learns it happened.

[`log`](../log/) solved the same problem with ids and can let them reset, because
it is memory. This cannot, so the count goes **in the rows** — one place holding
it, rather than a number beside them to disagree with.

## the blunt redaction rules, asked for by name

`looks-like`'s narrow rules are the log's, and are right for a log: redacting
every long random string would eat the commit hashes and ids that make one worth
reading.

**Here the cost of being wrong runs the other way.** A live log is gone at the
next restart; this is on disk for ever, gets copied into backups, and is the
first thing anybody attaches to a bug report. So it asks for
`redact(text, 'durable')`: anything long and random, and the tail of every URL.

It is not decoration. Starting a sign-in writes *"open
`https://claude.ai/oauth/...`"* under a tag the allowlist **keeps** — so without
this, beginning a sign-in would put an authorize URL on disk, which is the exact
thing the live log stays in memory to avoid, arriving through the door the
allowlist opened.

## the file

`state/events.jsonl`, under [`dataDir`](../dataDir/) — so a
[profile](../dataDir/) moves it like everything else.

**Rewritten whole rather than appended to**, because the cap has to hold and a
file that only grows is what makes somebody delete the lot. At two thousand lines
that is cheap, and it happens on an act rather than on a timer.

**A half-written last line is skipped, not treated as corruption.** It is a
process that was killed mid-write; throwing would lose the whole record, and from
outside that is indistinguishable from the app never having kept anything.

## the server half carries on rather than refusing

Harder to justify than [`state`](../state/)'s refusal, so: `state` refuses
because state at a plausible wrong path is state the next start will not find,
and [`secret`](../secret/) refuses because a stand-in that quietly wrote
cleartext would look exactly like success.

**Losing a note about an act costs a line in a record.** The act still happened,
and the plugin that did it should not fail because nothing was there to write it
down. So `keep` is a no-op and `all` is empty — and `kept` answers `false`, which
is the one word that tells an empty record from one nothing is writing.
