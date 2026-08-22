// Run one of this app's own commands and say what is happening, one line per
// thing that happened.
//
//   node tools/monitor.js test
//   node tools/monitor.js drive -- --swatches
//   node tools/monitor.js dist
//
// EVERY LINE IS AN EVENT, AND THE LAST ONE IS ALWAYS THE END. Something
// watching this -- a terminal, a CI step, an agent that gets woken per line --
// never has to know which words a particular tool prints when it finishes.
// `npm test` ends with `ℹ fail 0`, drive ends with `N checks passed` unless it
// ends with `N failed`, pack ends with `packaged into build/out`. That table
// was written down twice and was wrong once; here it is one contract instead:
//
//   ·  something happened, and it is going fine
//   x  something is wrong -- a failing test, a stack, an error line
//   ✔  finished, and nothing was wrong          THE LAST LINE
//   ✖  finished, and something was              THE LAST LINE
//
// WHY NOT `grep` THE TOOL DIRECTLY, which is what this replaces and is one
// line: because the filter has to be rewritten per command, and a filter
// written for the good case is SILENT when the command dies. A watcher cannot
// tell silence from still-running, so the failure that matters most -- the
// crash -- is the one that never arrives. Here the terminal line is printed by
// a `finally`: a non-zero exit, a signal, a tool that cannot even start, all of
// them end with ✖ and a reason.
//
// It is not a test runner, a scheduler or a log. It runs one command, says what
// it saw, and exits with what the command exited with.

const path = require('node:path')
const cp = require('node:child_process')

const ROOT = path.join(__dirname, '..')

// the scripts in package.json, minus npm. `npm run test` costs about half a
// second of npm before node starts and buries the real exit code behind its
// own -- and an exit code is most of what this tool is for.
const COMMANDS = {
  test: ['tools/test.js'],
  drive: ['tools/drive.js'],
  docs: ['tools/docs.js'],
  build: ['tools/build.js'],
  dist: ['tools/build.js', 'tools/pack.js'],
  log: ['tools/log.js']
}

// A LINE WORTH WAKING SOMEBODY FOR. Anything else is scrolled past, which is
// what makes the stream sparse enough to be one notification per event rather
// than one per line of webpack output.
const PROGRESS = [
  /^building /, /^compiling /, /^staged /, /^packaged /, /^packaging /,
  /^launching /, /^starting /, /^driving /, /^shutting /, /^leaving /,
  /^no \.js/, /^\d+ pages:/, /^\d+ swatches:/, /^only /, /READMEs, read back/
]

// AND ANYTHING SHAPED LIKE A COMPLAINT. Deliberately broad: a false event costs
// a line, and a missed one costs the whole point of watching.
const TROUBLE = [
  /^\s*✖/, /^\s*x /, /^not ok\b/, /\bERR_/, /\bError\b/, /\bERROR\b/,
  /^\s*at .*\(.*:\d+:\d+\)/, /Module not found/, /Cannot find module/,
  /\bfailed\b/i, /ℹ fail [1-9]/
]

// what a run's own summary looks like, kept for the last line
const SUMMARY = [
  /^ℹ (pass|fail) \d+/, /^\d+ checks passed/, /^\d+ failed, \d+ passed/,
  /^\d+ findings?$/, /^nothing to say$/
]

// A LINE THAT SAYS IT PASSED IS NOT TROUBLE, whatever words are in it. The
// trouble list is deliberately broad -- it matches `failed` anywhere -- and a
// test called "separates a tool that FAILED from a tool that is not there"
// passed thirteen times while this reported ✖ on a run that exited 0. Checked
// first, because the tick is a stronger signal than any word after it.
const PASSED = [/^\s*✔/, /^\s*ok/, /^\s*﹣/, /^\s*ℹ (pass|suites|tests|duration|todo|cancelled|skipped)/]

function matches (line, patterns) { return patterns.some(rx => rx.test(line)) }

// UNBUFFERED, ONE WRITE PER EVENT. A watcher reading this through a pipe gets
// nothing until a buffer fills otherwise, and a build's worth of events arrives
// in one lump at the end -- which is a log, not a stream.
function say (line) { process.stdout.write(line + '\n') }

function seconds (from) { return Math.round((Date.now() - from) / 1000) + 's' }

// A STACK IS ONE EVENT, NOT TWELVE. The first run of this against a real
// failure emitted thirty lines, twenty of them `at Test.run (node:internal/…)`
// -- frames from node's own runner, which say nothing about this app and bury
// the two lines that do. The first frame is kept because it names the file and
// line; the rest are counted.
const FRAME = /^\s*at\s/

function run (scripts, args, options) {
  const started = Date.now()
  const summary = []
  let bad = 0
  let frames = 0

  // TWO CLOCKS, AND CONFUSING THEM MADE THE FLAG A LIE. `heard` is the last
  // time the CHILD said anything, which is what silence means and what
  // --give-up counts. `beat` is the last time this tool spoke, which is only
  // for spacing the heartbeats out.
  //
  // With one clock, each heartbeat reset the thing it was measuring: quiet
  // reported 3s, 6s, 12s and `--give-up=12` fired after twenty-one seconds of
  // actual silence. A number that does not mean what it says is worse than no
  // number, because it is the one somebody will quote.
  let heard = Date.now()
  let beat = Date.now()
  let seen = 0
  let reported = 0
  let wait = options.quiet
  let running = scripts[0]
  let child = null
  let ticker = null

  const giveUp = options.giveUp

  //SAYING SOMETHING SPACES THE NEXT HEARTBEAT OUT, which is why run speaks
  //through here rather than writing to stdout itself. It does not touch
  //`heard`: silence is the child's, not ours.
  function said (line) { beat = Date.now(); say(line) }

  function abandon () {
    if (!child) return
    try { child.kill() } catch (e) { /* already gone */ }
  }

  // and a run that goes wrong in one place should not out-shout a run that goes
  // wrong in twenty: after this many, it says how many more there were
  const MOST = 12

  function trouble (text) {
    bad++
    if (bad === MOST + 1) return said('x ... and more, run it yourself to read them')
    if (bad > MOST) return
    said('x ' + text)
  }

  function line (text) {
    const clean = text.replace(/\s+$/, '')
    heard = Date.now()
    seen++
    if (!clean.trim()) return

    if (FRAME.test(clean)) {
      frames++
      if (frames === 1) trouble(clean.trim())
      return
    }
    frames = 0

    if (matches(clean, PASSED)) {
      //a summary line is still worth keeping for the ending
      if (matches(clean, SUMMARY)) { summary.push(clean.trim()); said('· ' + clean.trim()) }
      return
    }

    if (matches(clean, TROUBLE)) return trouble(clean.trim())
    if (matches(clean, SUMMARY)) { summary.push(clean.trim()); return said('· ' + clean.trim()) }
    if (matches(clean, PROGRESS)) return said('· ' + clean.trim())
  }

  // AND SAYING NOTHING IS ALSO AN EVENT.
  //
  // Everything above fires when a line arrives. A command that hangs prints no
  // line, so it produces no events, and a watcher cannot tell "still working"
  // from "wedged an hour ago" -- which is the same silence-is-not-success trap
  // this tool exists to close, one level up. `nwjc` on a slow machine and a
  // packaged drive waiting for a window both go quiet for a minute at a time
  // legitimately, so silence cannot simply be a failure either.
  //
  // So the quiet itself is reported. It says which of the two silences it is:
  // the child printing nothing at all, or the child printing plenty that is not
  // worth an event -- webpack does the second for most of a build.
  //
  // BACKING OFF, because a heartbeat every 30s through a four-minute package is
  // eight events that all say the same thing. Each wait is twice the last, up
  // to five minutes.
  // THE DEADLINE IS CHECKED EVERY TICK, THE HEARTBEAT IS NOT.
  //
  // These were one thing, and the backoff then decided when the deadline was
  // noticed: heartbeats at 4s, 10s and 22s meant `--give-up=12` gave up at
  // twenty-two seconds. The heartbeat is allowed to be approximate because it
  // is a nudge; the deadline is a number somebody chose, so it is exact.
  function tick () {
    const quietFor = Math.round((Date.now() - heard) / 1000)

    if (giveUp && quietFor >= giveUp) {
      said('x nothing for ' + quietFor + 's, past --give-up=' + giveUp + ' -- stopping ' + running)
      return abandon()
    }

    if (quietFor < options.quiet) return
    if ((Date.now() - beat) / 1000 < wait) return

    const noise = seen - reported
    reported = seen

    said('· quiet ' + quietFor + 's -- ' + (noise
      ? noise + ' lines, none worth an event'
      : 'nothing at all from ' + running))

    wait = Math.min(wait * 2, 300)
  }

  // ONE AT A TIME, IN ORDER, and the first failure stops the rest -- `dist` is
  // a build and then a pack, and packaging a build that did not happen makes a
  // package of whatever was there last time. That is the kind of green that
  // wastes an afternoon.
  function next (at, done) {
    if (at >= scripts.length) return done(0)

    running = scripts[at]

    // THE OUTER `child`, NOT A NEW ONE. This was `const child = spawn(...)`,
    // which shadowed it -- so `abandon()` looked at a variable that was still
    // null and the give-up timer killed nothing at all, silently, which is the
    // exact failure this whole tool is about.
    child = cp.spawn(process.execPath, [running].concat(args), {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let held = { out: '', err: '' }

    function feed (which, chunk) {
      held[which] += chunk
      const parts = held[which].split(/\r?\n/)
      held[which] = parts.pop()
      parts.forEach(line)
    }

    child.stdout.on('data', d => feed('out', d.toString()))
    child.stderr.on('data', d => feed('err', d.toString()))

    // A TOOL THAT CANNOT START AT ALL still has to end the stream. This used to
    // be an unhandled 'error' event, which killed the monitor and left whoever
    // was watching with the last progress line and no ending.
    child.on('error', e => {
      said('x could not run ' + scripts[at] + ': ' + (e && e.message))
      done(127)
    })

    child.on('close', (code, signal) => {
      ;['out', 'err'].forEach(which => { if (held[which]) line(held[which]) })
      if (signal) { said('x ' + scripts[at] + ' was killed by ' + signal); return done(1) }
      if (code) return done(code)
      next(at + 1, done)
    })
  }

  // the clock only matters while something is running, and an unref'd timer
  // cannot be the reason the process stays up
  ticker = setInterval(tick, 1000)
  if (ticker.unref) ticker.unref()

  next(0, code => {
    clearInterval(ticker)

    // THE LAST LINE, ALWAYS, WHATEVER HAPPENED -- see the note at the top.
    const tail = summary.length ? ' -- ' + summary.join(' -- ') : ''
    const wrong = bad ? ' -- ' + bad + (bad === 1 ? ' bad line' : ' bad lines') : ''

    if (code === 0 && !bad) say('✔ done in ' + seconds(started) + tail)
    else say('✖ ended in ' + seconds(started) + ' -- exit ' + code + wrong + tail)

    process.exit(code || (bad ? 1 : 0))
  })
}

function main () {
  const argv = process.argv.slice(2)

  // THIS TOOL'S OPTIONS COME FIRST, and the command's own come after `--`.
  // `drive --swatches` and `monitor --quiet=10` both start with two dashes, so
  // position is what tells them apart rather than a list of names this file
  // would have to keep in step with four other tools.
  const options = { quiet: 30, giveUp: 600 }

  while (/^--(quiet|give-up)=/.test(argv[0] || '')) {
    const [name, value] = argv.shift().slice(2).split('=')
    const number = Number(value)

    if (!Number.isFinite(number) || number < 0) {
      say('x --' + name + ' wants a number of seconds, not "' + value + '"')
      say('✖ ended in 0s -- exit 2 -- bad option')
      return process.exit(2)
    }

    if (name === 'quiet') options.quiet = number || Infinity //0 turns it off
    else options.giveUp = number //0 means never give up
  }

  const what = argv.shift()
  const args = argv[0] === '--' ? argv.slice(1) : argv

  if (!what || !COMMANDS[what]) {
    say('x say one of: ' + Object.keys(COMMANDS).join(', '))
    say('✖ ended in 0s -- exit 2 -- nothing to run')
    return process.exit(2)
  }

  say('· ' + what + (args.length ? ' ' + args.join(' ') : '') + ' started')
  run(COMMANDS[what], args, options)
}

main()
