'use strict'

// Is the app up, and which process is it.
//
// WRITTEN ONCE BECAUSE THREE THINGS ASK IT. `nw.js` asks before launching a
// second copy, `stop.js` asks before signalling anything, and `restart.js` asks
// twice -- once to know what to close and again to know it is gone. Three
// derivations of "is it running" is how one of them ends up trusting a file the
// others do not.
//
// HOW IT KNOWS. `core/lifecycle/main.js` writes .nw-instance.json with its pid
// and url while it runs, and removes it on teardown. A file left behind by a
// hard kill is NOT trusted on its own: signalling the pid with 0 asks the
// operating system whether anything is actually there, and throws when it is
// not. That is the difference between "the app is running" and "the app died
// without tidying up", which look identical on disk.
//
// A PACKAGED BUILD WRITES NO INSTANCE FILE -- lifecycle only does that in
// development, because an installed app has no launcher reading it. So this
// answers null for one that is genuinely running, and callers that need the
// stronger answer ask the control socket instead. `stop.js` says so rather than
// reporting "already stopped" for an app that is plainly on screen.

const fs = require('node:fs')
const path = require('node:path')

const APP = path.join(__dirname, '..')
const INSTANCE_FILE = path.join(APP, '.nw-instance.json')

module.exports.APP = APP
module.exports.INSTANCE_FILE = INSTANCE_FILE

module.exports.instance = function instance () {
  try {
    const info = JSON.parse(fs.readFileSync(INSTANCE_FILE, 'utf8'))
    process.kill(info.pid, 0) // does not kill, just asks whether it is there
    return info
  } catch (err) {
    return null // no file, unreadable, or the pid is gone
  }
}

// AND THE STALE FILE IS SOMEBODY'S TO CLEAR. A hard kill leaves it behind, and
// the next launcher reads it, signals a pid that is gone, and gets null -- which
// is correct but leaves the file there for ever. Whoever established that
// nothing is running is the one who knows it is safe to remove.
module.exports.forget = function forget () {
  try { fs.unlinkSync(INSTANCE_FILE); return true }
  catch (err) { return false }
}
