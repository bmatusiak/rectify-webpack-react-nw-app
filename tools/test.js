// npm test, and how to run one thing.
//
// There are five places a test can live and they do not run the same way:
//
//   test/*.test.js       plain node, no app                 (`node`)
//   <plugin>/main.test.js    nw's node side                 (`main`)
//   <plugin>/server.test.js  the app's node half            (`server`)
//   <plugin>/window.test.js  the page, in a browser         (`window`)
//   <plugin>/cli.test.js     a terminal process             (`cli`)
//
// All of them go through `node --test` in the end -- the last four by way of
// test/selftest.test.js, which starts the app and asks it to run its own. What
// this adds is aim:
//
//   npm test                     everything
//   npm test -- window           only the browser suites
//   npm test -- main             only nw's node side
//   npm test -- node             only the ones that need no app at all
//   npm test -- core/ipc         that plugin, in every context it has one
//   npm test -- core/ipc/main    that plugin, in one
//   npm test -- requires         test/requires.test.js
//   npm test -- --list           what there is to aim at

const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const shared = require('./selftest')

const ROOT = shared.ROOT
const TESTS = path.join(ROOT, 'test')

// the four that need a running app, and the one that does not
const CONTEXTS = ['main', 'server', 'window', 'cli']
const IN_APP = 'selftest.test.js'

const target = process.argv.slice(2).filter(a => a !== '--list')[0]
const listing = process.argv.includes('--list')

function files () {
  return fs.readdirSync(TESTS).filter(name => name.endsWith('.test.js'))
}

// every plugin test there is, as `core/ipc/main`
function plugins () {
  const found = []
  for (const context of CONTEXTS) {
    for (const file of shared.gather(context + '.test.js')) found.push(shared.named(file))
  }
  return found.sort()
}

function list () {
  console.log('\ncontexts')
  console.log('  node                 the tests that need no app')
  for (const context of CONTEXTS) console.log('  ' + context.padEnd(20) + describe(context))

  console.log('\nfiles in test/')
  for (const name of files()) console.log('  ' + name.replace('.test.js', ''))

  console.log('\nplugins')
  for (const name of plugins()) console.log('  ' + name)
  console.log('')
}

function describe (context) {
  return {
    main: "nw's node side",
    server: "the app's node half",
    window: 'the page, in a browser',
    cli: 'a terminal process'
  }[context]
}

// node --test, with whatever the target worked out to
function run ({ paths, env, why }) {
  if (why) console.log(why + '\n')

  const out = spawnSync(process.execPath, ['--test'].concat(paths), {
    stdio: 'inherit',
    cwd: ROOT,
    env: Object.assign({}, process.env, env || {})
  })

  process.exit(out.status === null ? 1 : out.status)
}

if (listing) { list(); process.exit(0) }

// EVERYTHING
//
// the files by name, for two reasons. `node --test <dir>` tries to require the
// directory as a module and says it cannot find it. And bare `node --test`
// globs for *.test.js across the whole project, which picks up the twenty-seven
// plugin tests as well -- those are rectify plugins, not node test files, and
// running them standalone registers nothing while looking like it ran.
if (!target) {
  run({ paths: files().map(name => path.join(TESTS, name)) })
}

// A CONTEXT: main, server, window, cli
if (CONTEXTS.includes(target)) {
  run({
    paths: [path.join(TESTS, IN_APP)],
    env: { TEST_CONTEXTS: target, TEST_ONLY: '' },
    why: 'only the ' + target + ' context -- ' + describe(target)
  })
}

// THE ONES THAT NEED NO APP
if (target === 'node') {
  const paths = files().filter(name => name !== IN_APP).map(name => path.join(TESTS, name))
  run({ paths, why: 'only the tests that need no app (' + paths.length + ' files)' })
}

// A FILE IN test/
const file = files().filter(name => name === target || name.replace('.test.js', '') === target)[0]
if (file) {
  run({ paths: [path.join(TESTS, file)], why: 'only test/' + file })
}

// A PLUGIN, with or without its context
const matched = plugins().filter(name => name.includes(target))
if (matched.length) {
  // `core/ipc/main` names a context as well; `core/ipc` does not
  const contexts = [...new Set(matched.map(name => name.split('/').pop()))]

  run({
    paths: [path.join(TESTS, IN_APP)],
    env: { TEST_ONLY: target, TEST_CONTEXTS: contexts.join(',') },
    why: 'only ' + matched.join(', ')
  })
}

console.error('nothing is called "' + target + '".')
console.error('try `npm test -- --list` to see what there is.')
process.exit(1)
