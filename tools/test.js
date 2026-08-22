// npm test, and how to run one thing.
//
// There are six places a test can live and they do not run the same way:
//
//   test/*.test.js           the app itself: the tree, the build, the boots
//   <plugin>/node.test.js    that plugin, in plain node     (`node`)
//   <plugin>/main.test.js    nw's node side                 (`main`)
//   <plugin>/server.test.js  the app's node half            (`server`)
//   <plugin>/window.test.js  the page, in a browser         (`window`)
//   <plugin>/cli.test.js     a terminal process             (`cli`)
//
// THE FIRST TWO ARE THE SAME RUNNER AND A DIFFERENT SUBJECT. `test/` is about
// the app -- the shape of the tree, the webpack graph, whether the five
// discovery sites agree. A `node.test.js` is about ONE plugin, and is beside it
// for the same reason its README is: everything about a plugin is in its folder.
// Six of these used to be in test/ under names that said what they were about
// (`fanout`, `mock`, `capture`) rather than whose they were.
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
const NODE = 'node'
const IN_APP = 'selftest.test.js'

const target = process.argv.slice(2).filter(a => a !== '--list')[0]
const listing = process.argv.includes('--list')

function files () {
  return fs.readdirSync(TESTS).filter(name => name.endsWith('.test.js'))
}

// every plugin test there is, as { name: 'core/ipc/main', context, file }. The
// walk is tools/selftest.js's, across every tree, so a suite in a second tree is
// as findable as one in the first.
function suites () {
  const found = []
  for (const context of CONTEXTS.concat(NODE)) {
    for (const file of shared.gather(context + '.test.js')) {
      found.push({ name: shared.named(file), context, file })
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

// the ones that run here rather than in the app
const nodeSuites = () => suites().filter(one => one.context === NODE).map(one => one.file)

// EVERYTHING THAT RUNS IN THIS PROCESS, defined once. `npm test` is this plus
// the one file that goes and asks the app, and `npm test -- node` is this on its
// own -- written out twice, one of them would eventually stop including a whole
// kind of suite, and a run that quietly tests less still says `fail 0`.
const appFree = () => files().filter(name => name !== IN_APP)
  .map(name => path.join(TESTS, name))
  .concat(nodeSuites())

function list () {
  console.log('\ncontexts')
  console.log('  ' + NODE.padEnd(20) + describe(NODE))
  for (const context of CONTEXTS) console.log('  ' + context.padEnd(20) + describe(context))

  console.log('\nfiles in test/, which are about the app itself')
  for (const name of files()) console.log('  ' + name.replace('.test.js', ''))

  console.log('\nplugins')
  for (const one of suites()) console.log('  ' + one.name)
  console.log('')
}

function describe (context) {
  return {
    main: "nw's node side",
    server: "the app's node half",
    window: 'the page, in a browser',
    cli: 'a terminal process',
    node: 'plain node: test/, and every plugin/node.test.js'
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
//
// selftest.test.js goes last because it is the one that starts an app: whatever
// can be answered without one is answered before anything is launched.
if (!target) {
  run({ paths: appFree().concat(path.join(TESTS, IN_APP)) })
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
if (target === NODE) {
  const paths = appFree()
  run({ paths, why: 'only the tests that need no app (' + paths.length + ' files)' })
}

// A FILE IN test/, A PLUGIN, OR BOTH
//
// BOTH, WHICH IS WHY THIS COLLECTS RATHER THAN RUNS. It used to answer with the
// first match and stop, so `npm test -- mcp` found test/mcp.test.js, ran it, and
// never looked for the plugin -- a green run reporting on a third of what was
// asked for, with nothing to say it had skipped anything. A target that names
// two things runs both of them.
const file = files().filter(name => name === target || name.replace('.test.js', '') === target)[0]
const matched = suites().filter(one => one.name.includes(target))

if (file || matched.length) {
  const paths = []
  const why = []

  if (file) { paths.push(path.join(TESTS, file)); why.push('test/' + file) }

  // a plugin's node suite runs here, in this process
  matched.filter(one => one.context === NODE).forEach(one => paths.push(one.file))

  // and the rest are asked of the running app, through the one file that knows
  // how to reach it. `core/ipc/main` names a context as well; `core/ipc` does
  // not, so which contexts to ask for is read back off what matched.
  const contexts = [...new Set(matched.filter(one => one.context !== NODE).map(one => one.context))]
  if (contexts.length) paths.push(path.join(TESTS, IN_APP))

  why.push(...matched.map(one => one.name))

  run({
    paths,
    env: contexts.length ? { TEST_ONLY: target, TEST_CONTEXTS: contexts.join(',') } : {},
    why: 'only ' + why.join(', ')
  })
}

console.error('nothing is called "' + target + '".')
console.error('try `npm test -- --list` to see what there is.')
process.exit(1)
