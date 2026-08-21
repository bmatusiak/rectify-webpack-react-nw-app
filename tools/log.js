// What the running app has been saying.
//
//   npm run log            what went wrong, most recent last
//   npm run log -- --all   everything, unwrapped
//   npm run log -- -f      and keep watching
//   npm run log -- 40      how many lines to show (default 25)
//
// The app is launched detached with its output going to nw.log, so this file is
// the only account of what it did. It is also mostly chromium talking about
// itself, and every line the app itself wrote is wrapped in quotes with a
// source and a line number bolted on -- which is why reading it raw is a chore
// and why this exists.
//
// tools/nw.js uses the same two functions to explain a boot that threw.

const fs = require('node:fs')
const path = require('node:path')

const NEWLINE = String.fromCharCode(10)
const BACKSLASH = String.fromCharCode(92)
const ESCAPED_QUOTE = BACKSLASH + String.fromCharCode(34)

// a stack frame that was folded into one line, put back onto several
const STACK_BREAK = new RegExp(BACKSLASH + BACKSLASH + 'n(?=[ ])', 'g')

const LOG_FILE = path.join(__dirname, '..', 'nw.log')

// chromium describing its own startup, which is never what anybody came for
const NOISE = /WARNING:chrome|WARNING:apps|INFO:CONSOLE\(\d+\)|DevTools listening|PushMessagingService|Desktop Identity|sad_tab|Extension does not provide/

// what a build or a boot going wrong looks like, in any of the four contexts
const TROUBLE = /error|cannot|failed|undefined|not a function|throw|SyntaxError|ERROR in|Module build|unexpected|refused|at /i

// The message the app wrote, without the wrapping nw puts around it.
function unwrap (raw) {
  const open = raw.indexOf('"')
  const close = raw.lastIndexOf('"')

  let text = (open >= 0 && close > open) ? raw.slice(open + 1, close) : raw
  text = text.replace(STACK_BREAK, NEWLINE).split(ESCAPED_QUOTE).join('"')

  return text.split(NEWLINE).filter((one) => one.trim())
}

// Everything worth reading in a chunk of log, oldest first.
function lines (text, { all } = {}) {
  const out = []

  for (const raw of String(text).split(NEWLINE)) {
    if (!raw.trim()) continue
    if (!all && NOISE.test(raw)) continue
    if (!all && !TROUBLE.test(raw)) continue

    for (const one of unwrap(raw)) out.push(one)
  }
  return out
}

module.exports = { LOG_FILE, lines, unwrap }

if (require.main === module) {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const follow = args.includes('-f') || args.includes('--follow')
  const count = Number(args.filter((a) => /^\d+$/.test(a))[0]) || 25

  if (!fs.existsSync(LOG_FILE)) {
    console.log('no nw.log yet -- nothing has been run, or it was cleared')
    process.exit(0)
  }

  const show = (text, limit) => {
    const found = lines(text, { all })
    if (!found.length) return false

    for (const one of found.slice(-limit)) console.log(one)
    return true
  }

  const said = show(fs.readFileSync(LOG_FILE, 'utf8'), count)
  if (!said) console.log(all ? 'the log is empty' : 'nothing has gone wrong (--all for everything)')

  if (follow) {
    console.log(NEWLINE + '...watching ' + path.relative(process.cwd(), LOG_FILE) + ', ctrl-c to stop')

    let at = fs.statSync(LOG_FILE).size
    setInterval(() => {
      let size = 0
      try { size = fs.statSync(LOG_FILE).size } catch (err) { return }

      if (size < at) at = 0//it was cleared and started again
      if (size === at) return

      const fresh = fs.readFileSync(LOG_FILE, 'utf8').slice(at)
      at = size
      show(fresh, Infinity)
    }, 500)
  }
}
