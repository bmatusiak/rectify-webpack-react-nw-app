'use strict'

// WHICH nw PROCESSES BELONG TO THIS PROJECT.
//
// Asked when a launch is handed to an app that is already holding chromium's
// profile directory and then exits -- see ./nw.js, where that is the one failure
// the log describes and does not explain.
//
// A MODULE RATHER THAN A FUNCTION IN ./nw.js, because this is the half that can
// quietly be wrong: it parses a process listing, and a listing that is parsed
// slightly wrong names the wrong pid. Somebody is going to read that number and
// end that process. ./held.test.js asks it about the machine it is running on.
//
// IT NEVER ENDS ANYTHING, and that is not timidity. Something has to be running
// for the lock to be held, and nothing here can tell a wedged app from one
// somebody is using -- `nw`, `node` and `electron` all belong to more than one
// thing on a developer's machine, and `Get-Process nw | Stop-Process` took an
// unrelated project down during this scaffold's own development.

const path = require('node:path')
const { execFileSync } = require('node:child_process')

const APP = path.resolve(__dirname, '..')

// THE FULL COMMAND LINE, so a match is a PATH and never a program's name. On
// windows that means Get-CimInstance: tasklist does not print one, and matching
// on `nw.exe` is exactly the mistake this exists to avoid.
const WINDOWS = "Get-CimInstance Win32_Process -Filter \"Name='nw.exe'\" | " +
  'ForEach-Object { $_.ProcessId.ToString() + " " + $_.CommandLine }'

// A RENDERER IS NOT THE PROCESS HOLDING THE PROFILE. chromium starts one
// browser process and several children, and every child carries `--type=`.
// Listing them all would hand somebody five pids for one app.
function isChild (command) { return command.indexOf('--type=') >= 0 }

function listing () {
  if (process.platform === 'win32') {
    return execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS],
      { encoding: 'utf8', timeout: 20000, windowsHide: true })
  }

  return execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 20000 })
}

// `{ pid, command }` for every nw process started out of this project, browser
// processes only. An empty list is a real answer: nothing is holding anything.
function held (where) {
  const root = where || APP
  const found = []

  let said = ''
  try { said = listing() } catch (err) { return found }

  said.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    const cut = trimmed.indexOf(' ')
    if (cut < 0) return

    const pid = Number(trimmed.slice(0, cut))
    const command = trimmed.slice(cut + 1)

    if (!pid || pid === process.pid) return

    // THIS PROJECT, BY ITS PATH. Two checkouts of the same scaffold on one
    // machine are two different apps, and a name would call them one.
    if (command.indexOf(root) < 0) return
    if (isChild(command)) return

    found.push({ pid, command })
  })

  return found
}

// what to print next to a pid, so nobody ends one without looking first
function howToCheck (pid) {
  return process.platform === 'win32'
    ? 'Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '" | Select CommandLine'
    : 'ps -p ' + pid + ' -o args='
}

function howToEnd (pid) {
  return process.platform === 'win32' ? 'Stop-Process -Id ' + pid : 'kill ' + pid
}

module.exports = held
module.exports.held = held
module.exports.isChild = isChild
module.exports.howToCheck = howToCheck
module.exports.howToEnd = howToEnd
module.exports.APP = APP
