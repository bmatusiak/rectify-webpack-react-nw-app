'use strict'

// Close the app, and wait until it is actually closed.
//
//   npm run stop
//
// WAITING IS THE POINT, which is why this is a script and not one line in
// package.json. Asking a process to go and returning immediately leaves the
// caller believing it is gone while it still holds the control socket, the
// instance file and webpack's watchers -- and `npm run restart` started right
// then loses a race it does not know it is in.
//
// THE POLITE WAY FIRST. `node src/cli.js quit` reaches core/lifecycle over the
// control socket, which runs every plugin's onDestroy in reverse and removes the
// instance file on the way out. That is the only shutdown that lets a plugin
// finish what it was doing.
//
// AND A SIGNAL WHEN THAT CANNOT BE REACHED. The server half is rebuilt on every
// save, and a bundle that fails to load takes the ipc handlers with it -- so the
// app is on screen, holding everything, and `quit` answers "unknown command".
// Measured, twice, in one afternoon. When the polite way does not work the
// process is signalled instead, and the cost is that teardown does not run:
// the instance file is left behind, which is why it is removed here afterwards.
//
// IT ONLY EVER SIGNALS THIS APP'S OWN PID, read from the instance file this app
// wrote. Never a process matched by name -- `nw`, `node` and `electron` all
// belong to more than one thing on a developer's machine, and killing by image
// name took down an unrelated project during this scaffold's own development.
//
// ALREADY GONE IS NOT A FAULT. Somebody typing `stop` wants it stopped, and it
// being stopped already is that. This says so and exits 0.

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const running = require('./running')

const GIVE_UP = 15000
const LOOK_EVERY = 100

function alive (pid) {
  try { process.kill(pid, 0); return true }
  catch (err) { return false }
}

// A SLEEP THAT DOES NOT NEED A SLEEP. Blocking this process for a moment is
// exactly right here -- there is nothing else for it to do -- and spawning a
// node that waits is the portable way to do it without a dependency.
function pause (ms) {
  spawnSync(process.execPath, ['-e', 'setTimeout(function () {}, ' + ms + ')'])
}

function gone (pid, until) {
  while (Date.now() < until) {
    if (!alive(pid)) return true
    pause(LOOK_EVERY)
  }
  return !alive(pid)
}

const info = running.instance()

if (!info) {
  //A PACKAGED BUILD WRITES NO INSTANCE FILE, so this cannot tell one that is
  //running from nothing running at all -- and saying "already stopped" about an
  //app that is plainly on screen is worse than saying what was actually checked.
  console.log('nothing to stop: no ' + path.basename(running.INSTANCE_FILE) +
    ' with a live pid in it')
  console.log('  (a packaged build writes no instance file -- close that one yourself)')

  running.forget()
  process.exit(0)
}

console.log('stopping pid ' + info.pid + (info.url ? ' at ' + info.url : ''))

//the polite way, which is the only one that runs teardown
const asked = spawnSync(process.execPath, [path.join(running.APP, 'src', 'cli.js'), 'quit'], {
  cwd: running.APP,
  encoding: 'utf8'
})

const politely = asked.status === 0

if (!politely) {
  console.log('  the control socket did not take it -- ' +
    String(asked.stderr || asked.stdout || '').trim().split('\n')[0])
}

if (gone(info.pid, Date.now() + (politely ? GIVE_UP : 2000))) {
  running.forget()
  console.log(politely ? 'stopped' : 'stopped, without teardown')
  process.exit(0)
}

//IT IS STILL THERE, so it is signalled -- by pid, never by name.
console.log('  still up after being asked, signalling pid ' + info.pid)

try { process.kill(info.pid) }
catch (err) { /* it went in the moment between looking and signalling */ }

if (gone(info.pid, Date.now() + GIVE_UP)) {
  running.forget()
  console.log('stopped, without teardown')
  process.exit(0)
}

//NOT PRETENDING. A stop that reports success while the app holds the socket is
//how the next start fails for a reason nobody can see.
console.error('could not stop pid ' + info.pid + ' -- it is still running')
process.exit(1)
