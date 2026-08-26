'use strict'

// Launches the app in NW.js.
//
// The npm `nw` package extracts to a versioned directory (nwjs-sdk-v0.114.1-...)
// and its own shim looks for a plain `nwjs/` that is not always there. Rather
// than pin a path that changes on every upgrade, find the binary.

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const net = require('node:net')
const viewer = require('./log')

const NW_ROOT = path.resolve(__dirname, '..', 'node_modules', 'nw')
const APP = path.resolve(__dirname, '..')
const BINARIES = { win32: 'nw.exe', darwin: 'nwjs.app/Contents/MacOS/nwjs', linux: 'nw' }

function findBinary () {
  const name = BINARIES[process.platform] || 'nw'
  if (!fs.existsSync(NW_ROOT)) throw new Error('NW.js is not installed. Run:  npm install')
  for (const dir of ['nwjs', ...fs.readdirSync(NW_ROOT).filter(d => d.startsWith('nwjs'))]) {
    const candidate = path.join(NW_ROOT, dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`Could not find ${name} under ${NW_ROOT}`)
}

let binary
try {
  binary = findBinary()
} catch (err) {
  console.error(`\n${err.message}\n`)
  process.exit(1)
}

// TWO PROCESSES, AND ONLY ONE OF THEM WAS AUDIBLE.
//
// NW.js runs a node context (`node-main`, this app's main.js) and a renderer
// (the window, ui/*.js). `stdio: 'inherit'` was already here, so anything the
// node side printed came through — and the renderer's did not, because Chromium
// keeps console output for its devtools unless told otherwise. So a window that
// threw on load looked exactly like a window that had nothing to draw: a blank
// panel and silence, which is the ambiguity that has cost the most time here.
//
// `--enable-logging=stderr` is what routes it out. Every console.* and every
// uncaught error in the page arrives as
//
//     [INFO:CONSOLE(412)] "message", source: file:///.../ui/tasks.js (412)
//
// which is a file and a line number, from outside, with no window open to look
// at. Started in the background, that lands in the log whatever started it is
// writing — so `npm start` and `npm run restart` both keep it.
//
// THE THREE FORMS, MEASURED ON ONE CLEAN START RATHER THAN ASSUMED:
//
//   --enable-logging=stderr           5 lines here, including the console line
//   --enable-logging                  0 lines here. Same content, written to
//                                     %LOCALAPPDATA%\okc-dashboard\User Data\
//                                     chrome_debug.log instead
//   --enable-logging=stderr --v=1     342 lines here, 278 of them Chromium's own
//                                     internals: 72 about Chromecast socket
//                                     probing, 50 about the segmentation
//                                     platform, 44 about an identity manager
//                                     this app does not use
//
// So `=stderr` is not decoration. Without it the output is identical and lands
// in a file nobody is watching, which for a backgrounded process is silence.
// And `--v=1` is the next flag anybody reaches for: it does not add anything
// about THIS app, it adds Chromium talking about itself, and the line that
// matters is then somewhere in three hundred. Add it by hand for one run if the
// browser process itself is what is being chased.
// --remote-debugging-port=0 is what makes "Inspect main.js" on the tray work.
// main.js runs in a background page, which nw's own window API cannot reach, so
// the only way in is chromium's debugger. 0 means chromium picks a free port and
// writes it to DevToolsActivePort in the user data dir, so nothing is pinned and
// nothing collides; it listens on loopback only. Pass your own
// --remote-debugging-port to override it.
//
// SOURCE ONLY. A built or packaged app has no Inspect items on its tray, and
// opening a debugger onto it would hand back precisely what compiling the node
// half into main.bin was for -- while also being the one socket left listening
// in a build whose whole point is that nothing is. Ask for it by hand if you
// are debugging a packaged build; you will not get it by accident.
const FLAGS = ['--enable-logging=stderr']

// LETTING GO OF THE TERMINAL.
//
// This used to hold the shell for as long as the app ran, which is wrong for
// something you leave open all day -- and doubly so now that closing the window
// only hides it. So the child is detached and this process exits immediately.
//
// The output still matters (see above), so it goes to nw.log rather than
// nowhere. `--attach` keeps the old behaviour when you want to watch a run
// happen: the app stays in the foreground and its output on your screen.
//
// KNOWING IT IS ALREADY UP.
//
// NW.js is single instance: a second launch is handed to the running app,
// which brings its window back (main.js listens for App.on('open')). But that
// handoff happens inside the nw binary, where this script cannot see it -- the
// only sign is a line in the log of the process that is exiting. So main.js
// writes .nw-instance.json with its pid and url, and this reads it. A stale
// file from a hard kill is caught by signalling the pid, which throws when
// nothing is there.
// The app's control socket, derived the same way the app derives it. A
// packaged build writes no instance file -- lifecycle only does that in
// development, because an installed app has no launcher reading it -- but it
// does listen here, and a pipe exists only while the process holding it does.
// So this is the one "it is up" that answers in all three modes.
//
// Reaching into src/app/core for it is the one path in this file that a plugin
// move would break, which is the trade for not writing the address out twice.
const controlSocket = require('../src/app/core/ipc/endpoint.js')(require('../package.json').name)

const NEWLINE = String.fromCharCode(10)
// SHARED WITH ./stop.js AND ./restart.js. Three things asking whether the app is
// running, three different ways, is how one of them ends up trusting a file the
// others do not -- ./running.js carries the whole argument.
const INSTANCE_FILE = require('./running').INSTANCE_FILE
const LOG_FILE = path.join(APP, 'nw.log')

const runningInstance = require('./running').instance

const attach = process.argv.includes('--attach')

// THREE WAYS TO START THE SAME APP.
//
//   (nothing)   the source tree. webpack builds in memory, both halves reload
//   --build     build/app: the compiled main.bin, run by the sdk runtime. no
//               executable yet, so its console is still audible and the
//               devtools are still there. what `npm run build` leaves behind.
//   --package   build/out: the executable nw-builder produced. the normal
//               flavour, so no devtools — this is what a user would run.
//
// Each one runs strictly later output than the one above it, so a thing that
// works in the first and not the third narrows to the step between them.
const mode = process.argv.includes('--package') ? 'package'
  : process.argv.includes('--build') ? 'build'
    : 'source'

const STAGE = path.join(APP, 'build', 'app')
const OUT = path.join(APP, 'build', 'out')

// the packaged app is its own executable, so it is launched instead of the
// runtime rather than handed to it
function packagedBinary () {
  if (!fs.existsSync(OUT)) return null
  if (process.platform === 'darwin') {
    const app = fs.readdirSync(OUT).find(f => f.endsWith('.app'))
    return app ? path.join(OUT, app, 'Contents', 'MacOS', path.basename(app, '.app')) : null
  }
  const exe = fs.readdirSync(OUT).find(f =>
    process.platform === 'win32'
      ? f.endsWith('.exe') && !f.startsWith('notification_helper')
      : !f.includes('.') && fs.statSync(path.join(OUT, f)).isFile())
  return exe ? path.join(OUT, exe) : null
}

if (mode === 'build' && !fs.existsSync(path.join(STAGE, 'main.bin'))) {
  console.error('build/app is not staged. run:  npm run build')
  process.exit(1)
}
if (mode === 'package' && !packagedBinary()) {
  console.error('build/out has no application in it. run:  npm run dist')
  process.exit(1)
}

const launcher = mode === 'package' ? packagedBinary() : binary
const target = mode === 'build' ? STAGE : mode === 'source' ? APP : null

const passthrough = process.argv.slice(2)
  .filter(a => a !== '--attach' && a !== '--build' && a !== '--package')
const debugging = passthrough.some(a => a.startsWith('--remote-debugging-port'))
const args = [
  ...(target ? [target] : []),
  ...FLAGS,
  ...(mode === 'source' && !debugging ? ['--remote-debugging-port=0'] : []),
  ...passthrough
]

const running = runningInstance()
if (running) {
  console.log(`already running (pid ${running.pid}) at ${running.url}`)
  console.log('bringing its window to the front')
} else {
  console.log(`launching ${path.relative(APP, launcher)}  (${mode})`)
}

if (attach) {
  const child = spawn(launcher, args, { stdio: 'inherit' })
  child.on('exit', code => process.exit(code === null ? 1 : code))
} else {
  const log = fs.openSync(LOG_FILE, 'a')
  const from = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0
  const child = spawn(launcher, args, { detached: true, stdio: ['ignore', log, log] })
  child.unref()
  if (!running) console.log(`logging to ${path.relative(APP, LOG_FILE)}  (--attach to watch it live)`)

  watchStartup(child, from)
}

// DID IT ACTUALLY START.
//
// The child is detached and its output goes to a file, so a boot that throws
// looks exactly like a boot that worked: this script has already printed
// "launching" and returned the terminal. The app then never appears, and
// whoever is waiting has nothing to wait ON -- the last time this happened it
// cost a two and a half minute poll against a process that had died in the
// first second.
//
// So: hold the terminal until one of three things is true. The instance file
// shows up, which is main.js saying it is up; the child exits, which is a
// crash and the reason is in the log we just wrote; or neither happens for
// long enough that a slow machine is the likelier explanation than a fault.
//
// This does mean `npm start` no longer returns in half a second. It returns
// when the app is up, which in development is a few seconds, and that is the
// trade: a silent failure is worth more than those seconds.
function watchStartup (child, from) {
  const deadline = Date.now() + 30000
  let settled = false

  function finish (code) {
    if (settled) return
    settled = true
    clearInterval(poll)
    process.exit(code)
  }

  child.on('exit', code => {
    if (settled) return
    console.error(NEWLINE + `it exited (code ${code}) before it came up.`)

    // Its stdio is a file handle, and what it wrote on the way down is not
    // necessarily on disk yet. Reading the instant it exited got 38 bytes and
    // none of the stack -- so wait for the file to stop growing, briefly.
    settle(from)
      .then(alreadyUp)
      .then(handed => {
        // Exiting is also what a SECOND launch does. nw is single instance: it
        // passes the arguments to the copy already running and quits, code 0,
        // having written almost nothing. That is a success, and calling it a
        // crash sent me looking for a fault in the app that was working -- so
        // ask whether something is answering before blaming the exit.
        if (handed) {
          console.log('already running -- handed over to it')
          return finish(0)
        }

        explain(from)
        finish(1)
      })
  })

  let probing = false

  const poll = setInterval(() => {
    const up = runningInstance()
    if (up) {
      console.log(`up at ${up.url}`)
      return finish(0)
    }

    // In development the instance file is the signal and it is worth waiting
    // for: it is written after the server is listening, whereas the control
    // socket comes up early in the boot. Reporting the socket here said "up"
    // while the node half still had no handlers on it -- true, and useless.
    if (mode === 'source') {
      if (Date.now() > deadline) { late(from); finish(0) }
      return
    }

    if (probing) return
    probing = true

    answering().then(yes => {
      probing = false
      if (yes) {
        console.log('up, on ' + controlSocket)
        finish(0)
      }
    })

    if (Date.now() > deadline) {
      late(from)
      finish(0)
    }
  }, 250)
}

function late (from) {
  console.log('still not up after 30s. It may yet be; the log is where to look.')
  explain(from)
}

// Give the log a moment to finish arriving: poll until it stops growing, or
// until waiting longer is worse than reporting whatever is there.
function settle (from) {
  const until = Date.now() + 2000
  let last = -1

  return new Promise(resolve => {
    const tick = setInterval(() => {
      let size = 0
      try { size = fs.statSync(LOG_FILE).size } catch (err) { /* not written yet */ }

      if ((size > from && size === last) || Date.now() > until) {
        clearInterval(tick)
        resolve()
      }
      last = size
    }, 150)
  })
}

function alreadyUp () {
  if (runningInstance()) return Promise.resolve(true)
  return answering()
}

// Connecting is the whole question -- it says something is holding the address.
// The app wants a token before it will answer anything, and this does not have
// one and does not need one.
function answering () {
  return new Promise(resolve => {
    const probe = net.connect(controlSocket)
    const done = yes => { probe.destroy(); resolve(yes) }

    probe.on('connect', () => done(true))
    probe.on('error', () => done(false))
  })
}

// What this run put in the log, minus chromium talking about itself. The
// filtering and the unwrapping live in ./log.js, which `npm run log` is, so
// there is one idea of what a line of this file means rather than two.
function explain (from) {
  let fresh = ''
  try { fresh = fs.readFileSync(LOG_FILE, 'utf8').slice(from) } catch (err) { return }

  const found = viewer.lines(fresh)

  if (!found.length) {
    console.error(`nothing obvious in ${path.relative(APP, LOG_FILE)} -- read it with npm run log -- --all, or start again with --attach`)
    return
  }

  console.error('')
  for (const line of found.slice(0, 12)) console.error('  ' + line)
  console.error(`${NEWLINE}  ...npm run log has the rest`)
}

// Give the log a moment to finish arriving: poll until it stops growing, or
// until waiting longer is worse than reporting whatever is there.
function settle (from) {
  const until = Date.now() + 2000
  let last = -1

  return new Promise(resolve => {
    const tick = setInterval(() => {
      let size = 0
      try { size = fs.statSync(LOG_FILE).size } catch (err) { /* not written yet */ }

      if ((size > from && size === last) || Date.now() > until) {
        clearInterval(tick)
        resolve()
      }
      last = size
    }, 150)
  })
}

function alreadyUp () {
  if (runningInstance()) return Promise.resolve(true)
  return answering()
}

// Connecting is the whole question -- it says something is holding the address.
// The app wants a token before it will answer anything, and this does not have
// one and does not need one.
function answering () {
  return new Promise(resolve => {
    const probe = net.connect(controlSocket)
    const done = yes => { probe.destroy(); resolve(yes) }

    probe.on('connect', () => done(true))
    probe.on('error', () => done(false))
  })
}
