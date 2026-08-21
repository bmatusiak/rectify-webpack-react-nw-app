// Gathering and running the suites that only a real app can answer.
//
// Two things need this: tools/drive.js, which drives the app anyway, and
// test/selftest.test.js, which is how `npm test` reaches them. Neither should
// own it, or the day one is fixed the other quietly keeps the old behaviour.

const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const rectify = require('@bmatusiak/rectify')
const wanted = require('../src/target')

const ROOT = path.join(__dirname, '..')
const PLUGINS = path.join(ROOT, 'src', 'app')

// the same walk src/main.js and src/cli.js do: two levels, exact filename
function gather (name, dir = PLUGINS, depth = 2, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name[0] === '_' || entry.name[0] === '.' || entry.name === 'vendor') continue

    const here = path.join(dir, entry.name)
    const file = path.join(here, name)

    if (fs.existsSync(file)) out.push(file)
    if (depth > 1) gather(name, here, depth - 1, out)
  }
  return out
}

// The cli graph, built in this process. It is the client the terminal uses, and
// with `withTests` it also carries the cli context's own suites -- that context
// is not part of the running app, so whoever builds the graph runs them.
async function cliGraph ({ withTests, only } = {}) {
  const plugins = gather('cli.js').map(require)

  // always, like the three contexts inside the app: aiming happens when the run
  // is asked for, not when the graph is built
  if (withTests !== false) {
    gather('cli.test.js').forEach(file => plugins.push(wanted.tag(require(file), named(file))))
  }

  plugins.push(rectify.PluginBase)
  plugins.config = require(path.join(ROOT, 'src', 'config.js'))()

  const pkg = require(path.join(ROOT, 'package.json'))
  const app = await rectify.build(plugins, {
    isCli: true,
    root: ROOT,
    argv: [],
    appPackage: { title: pkg.title || pkg.name, name: pkg.name, version: pkg.version }
  }).start()

  return { app, ipc: app.services.ipc, selftest: app.services.selftest }
}

// What a plugin test is called: its folder under src/app and the context beside
// it, with no extension. `core/ipc/cli` -- which `core/ipc` is a prefix of.
function named (file) {
  const relative = path.relative(PLUGINS, file).split(path.sep).join('/')
  return relative.endsWith('.test.js') ? relative.slice(0, -'.test.js'.length) : relative
}

// Start it if it is not up, using the launcher, which already knows how to wait
// and how to report a boot that throws.
function start (args = []) {
  const out = spawnSync(process.execPath, [path.join(__dirname, 'nw.js')].concat(args),
    { stdio: 'inherit', cwd: ROOT })

  return out.status === 0
}

// Wait for the window to open its socket. "Up" from the launcher means the
// server is listening, which is earlier than there being anything to drive.
async function waitForView (ipc, seconds = 60) {
  const deadline = Date.now() + seconds * 1000
  let seen = { views: [], connected: 0 }

  while (Date.now() < deadline) {
    seen = await ipc.call('views', {}).catch(() => ({ views: [], connected: 0 }))
    if (seen.views.length) return seen
    await new Promise(r => setTimeout(r, 500))
  }
  return seen
}

// How many tests a context reported, which is how "it loaded its suites" is
// told apart from "it ran them and they passed".
function counted (context) {
  return (context.suites || []).reduce((n, suite) => n + suite.tests.length, 0)
}

module.exports = { ROOT, PLUGINS, gather, named, cliGraph, start, waitForView, counted }
