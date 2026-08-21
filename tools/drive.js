// Drive the real app and check what only the real app can answer.
//
// The unit tests boot the cli and server graphs in process, and server-graph
// boots the bundled node half. None of them can say whether the window renders,
// whether a page is readable, or whether clicking the thing on screen does what
// it says. That needs nw, a document and a compositor -- so this starts the app,
// drives it through its own control socket, and asks.
//
//   npm run drive              the source tree
//   npm run drive -- --build   the staged package
//   npm run drive -- --package the built executable
//   npm run drive -- --shots   and keep a screenshot of every page
//
// It leaves the app running if it was already running, and shuts it down if it
// was the one that started it.

const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const rectify = require('@bmatusiak/rectify')

const NEWLINE = String.fromCharCode(10)
const ROOT = path.join(__dirname, '..')
const SHOTS = path.join(ROOT, 'shots')

const OPTIONS = ['--shots', '--swatches']
const passthrough = process.argv.slice(2).filter(a => OPTIONS.indexOf(a) < 0)
const wantShots = process.argv.includes('--shots')
const everySwatch = process.argv.includes('--swatches')

// WCAG's floor for body text. Large text is allowed 3, and nothing here checks
// font size, so this is the strict reading on purpose.
const READABLE = 4.5

let passed = 0
const failures = []

function check (what, ok, detail) {
  if (ok) { passed++; return true }
  failures.push(what + (detail ? '  -- ' + detail : ''))
  console.log('  x ' + what + (detail ? '  ' + detail : ''))
  return false
}

function note (line) { console.log(line) }

// The app's own cli graph, built once, so every command below is an ipc call
// rather than a process. Same client the terminal uses.
async function client () {
  const plugins = []

  const walk = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name[0] === '_' || entry.name[0] === '.' || entry.name === 'vendor') continue

      const here = path.join(dir, entry.name)
      const file = path.join(here, 'cli.js')
      if (fs.existsSync(file)) plugins.push(require(file))
      if (depth > 1) walk(here, depth - 1)
    }
  }
  walk(path.join(ROOT, 'src', 'app'), 2)

  plugins.push(rectify.PluginBase)
  plugins.config = require(path.join(ROOT, 'src', 'config.js'))()

  const pkg = require(path.join(ROOT, 'package.json'))
  const app = await rectify.build(plugins, {
    isCli: true,
    root: ROOT,
    argv: [],
    appPackage: { title: pkg.title || pkg.name, name: pkg.name, version: pkg.version }
  }).start()

  return app.services.ipc
}

async function main () {
  const ipc = await client()

  const wasRunning = await ipc.running()
  if (!wasRunning) {
    note('starting the app' + (passthrough.length ? ' (' + passthrough.join(' ') + ')' : ''))

    // tools/nw.js already knows how to wait and how to report a boot that
    // throws, so this does not reimplement either
    const started = spawnSync(process.execPath, [path.join(__dirname, 'nw.js')].concat(passthrough),
      { stdio: 'inherit', cwd: ROOT })

    if (started.status !== 0) {
      console.log('\nit did not start, so there is nothing to drive')
      process.exit(1)
    }
  } else {
    note('driving the app that is already running')
  }

  // "up" from tools/nw.js means the server is listening, which is earlier than
  // the window having loaded and opened its socket. Driving needs the second
  // one, so wait for it rather than assuming the first implies it.
  const views = await waitForView(ipc)
  check('a view connects', views.views.length > 0, views.connected + ' connected')

  if (!views.views.length) return finish(wasRunning, ipc)

  note('driving ' + (views.views[0].title || 'the window'))

  // WHAT IS ON THE SIDEBAR, read off the app rather than listed here. A page
  // added to src/app/demo/pages is a page this drives, without being told.
  // .nav-pills, not .nav-link: the sidebar also carries an "on this page" list
  // of the current page's sections, and those are nav-links too. Reading both
  // gave fifteen "pages", three of which were headings on the first one.
  const nav = await ipc.call('read', { selector: '.app-sidebar .nav-pills .nav-link' })
  const pages = (nav.items || []).map(item => item.text).filter(Boolean)

  check('the sidebar has pages on it', pages.length > 0, pages.length + ' found')
  note('\n' + pages.length + ' pages: ' + pages.join(', ') + '\n')

  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true })

  for (const page of pages) {
    //by the same selector, and by position, so a page whose name also appears
    //in the jump list is not ambiguous
    const clicked = await ipc.call('click', {
      selector: '.app-sidebar .nav-pills .nav-item:nth-child(' + (pages.indexOf(page) + 1) + ') .nav-link'
    }).catch(e => ({ error: e.message }))
    if (!check(page + ': opens', !clicked.error, clicked.error)) continue

    await new Promise(r => setTimeout(r, 400))

    const active = await ipc.call('read', { selector: '.app-sidebar .nav-link.active' })
    check(page + ': becomes the active page', active.text === page, 'active is ' + active.text)

    // every heading and every piece of muted text on the page, measured
    await readable(ipc, page, 'main h1, main h2, main h4, main .h2', 'headings')
    await readable(ipc, page, 'main .text-body-secondary', 'muted text')

    if (wantShots) {
      const file = path.join(SHOTS, page.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png')
      const shot = await ipc.call('capture', { path: file }, 20000).catch(e => ({ error: e.message }))
      check(page + ': photographs', !shot.error, shot.error || (Math.round(shot.bytes / 1024) + ' kb'))
    }
  }

  await swatches(ipc)
  await finish(wasRunning, ipc)
}

// THE SAME PAGE IN SOMEBODY ELSE'S COLOURS.
//
// A theme kit that ships twenty-eight stylesheets has twenty-eight chances to
// put text on something it cannot be read against, and a swatch is free to pin
// any of the properties the shell is built from. Three of them by default,
// because it is the shape that matters; --swatches does the lot.
async function swatches (ipc) {
  const all = await ipc.call('read', { selector: '.navbar select option' }).catch(() => null)
  const names = ((all && all.items) || []).map(o => o.text).filter(Boolean)
  if (!names.length) return

  // one plain, one dark design, one that restyles everything
  const chosen = everySwatch ? names : names.filter(n => ['default', 'darkly', 'sketchy'].indexOf(n) >= 0)
  note(NEWLINE + chosen.length + ' swatches: ' + chosen.join(', ') + NEWLINE)

  for (const name of chosen) {
    const set = await ipc.call('fill', { selector: '.navbar select', value: name }).catch(e => ({ error: e.message }))
    if (!check('swatch ' + name + ': applies', !set.error, set.error)) continue

    await settled(ipc)

    await readable(ipc, 'swatch ' + name, 'main h1, main h2, main h4', 'headings')
    await readable(ipc, 'swatch ' + name, 'main .text-body-secondary', 'muted text')
    await readable(ipc, 'swatch ' + name, '.navbar-brand', 'the brand')
    await readable(ipc, 'swatch ' + name, '.app-sidebar .nav-pills .nav-link', 'the sidebar')
  }

  await ipc.call('fill', { selector: '.navbar select', value: 'default' }).catch(() => {})
}

async function waitForView (ipc, seconds = 45) {
  const deadline = Date.now() + seconds * 1000
  let seen = { views: [], connected: 0 }

  while (Date.now() < deadline) {
    seen = await ipc.call('views', {}).catch(() => ({ views: [], connected: 0 }))
    if (seen.views.length) return seen
    await new Promise(r => setTimeout(r, 500))
  }
  return seen
}

// A stylesheet arrives, and then the theme service looks at what it painted and
// decides whether data-bs-theme has to move with it. Measuring in between reads
// text coloured for one mode against a ground painted for the other, which is
// how a perfectly readable sidebar measured 1.5:1 on twelve swatches in a row.
//
// So wait for the number to stop moving rather than for a fixed delay.
async function settled (ipc, tries = 12) {
  let last = null

  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, 250))

    const seen = await ipc.call('read', { selector: '.app-sidebar' }).catch(() => null)
    const now = seen && seen.contrast && seen.contrast.ratio
    if (now && now === last) return

    last = now
  }
}

// One selector, every element it matches, and the worst contrast among them.
async function readable (ipc, page, selector, what) {
  const found = await ipc.call('read', { selector }).catch(() => null)
  if (!found) return

  const items = found.count > 1 ? found.items : [found]
  const measured = items.filter(item => item.contrast && item.visible)
  if (!measured.length) return

  const worst = measured.reduce((low, item) => item.contrast.ratio < low.contrast.ratio ? item : low)

  check(page + ': ' + what + ' are readable',
    worst.contrast.ratio >= READABLE,
    worst.contrast.ratio + ':1 on ' + worst.element + ' "' + worst.text.slice(0, 30) + '"')
}

async function finish (wasRunning, ipc) {
  if (!wasRunning) {
    note('\nshutting it down again')
    await ipc.call('quit', {}).catch(() => {})
  } else {
    note('\nleaving it running, since it was')
  }

  console.log('')
  if (failures.length) {
    console.log(failures.length + ' failed, ' + passed + ' passed')
    failures.forEach(f => console.log('  x ' + f))
    process.exit(1)
  }

  console.log(passed + ' checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error('\n' + (err && err.stack || err))
  process.exit(1)
})
