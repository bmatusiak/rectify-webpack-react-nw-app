'use strict'

// DOES IT COMPILE. Nothing else.
//
//   npm run check
//
// THIS EXISTS BECAUSE THE ALTERNATIVES ARE THE WRONG TOOL FOR THE QUESTION.
// `npm test` is thirty-odd seconds and needs a running app; `npm run restart`
// rebuilds AND relaunches and takes the open window down with it. Both were
// being reached for to answer something that is about the SOURCE and not about
// the process -- and during a migration, where most of what goes wrong is a
// renamed service or a typo, that is the only question being asked.
//
// WHAT IT DOES NOT TELL YOU is whether the thing WORKS. A page that compiles and
// draws nothing compiles perfectly. That answer comes from the app:
//
//     npm test -- my-plugin      the suites beside it, in the real app
//     npm run drive              every page opened and measured
//
// WRITES NOTHING. `dist/` is what the dev server serves out of and what
// build.js clears and fills, so a check that emitted into it would leave a
// running app serving a bundle nobody asked for. The output filesystem is a
// no-op and the real `dist/` is never touched.
//
// BOTH BUNDLES, because they are separate compilations that fail separately --
// and the one that breaks is reliably the one not being looked at.
//
// AND THE FILES NO BUNDLE CONTAINS. `main.js`, every `<plugin>/main.js` and
// every `cli.js` are read off disk at runtime, so webpack never sees them and a
// syntax error in one shows up as the app failing to start. Those are parsed
// here directly, which is the difference between this check and the one it was
// modelled on.

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const webpack = require('webpack')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const ROOTS = require('../src/roots')

const quiet = process.argv.includes('--quiet')
const began = Date.now()

// A NO-OP FILESYSTEM. webpack's output interface with every write thrown away --
// cheaper than memfs, and one less dependency for something that reads nothing
// back.
const nowhere = {
  join: path.join.bind(path),
  mkdir (dir, opts, cb) { (cb || opts)(null) },
  writeFile (file, data, cb) { (cb || data)(null) },
  stat (file, cb) { cb(new Error('nothing was written')) },
  readFile (file, cb) { cb(new Error('nothing was written')) },
  unlink (file, cb) { cb(null) },
  rmdir (dir, cb) { cb(null) }
}

//---- the two bundles ------------------------------------------------------

function bundles () {
  return new Promise((resolve) => {
    const configs = require(path.join(ROOT, 'webpack.config.js'))({}, { mode: 'development' })

    const compiler = webpack(configs.map((one) => Object.assign({}, one, {
      //DEVTOOL OFF. Source maps are most of the time in a development build and
      //nothing here is going to read one.
      devtool: false,

      //and the hot client is not a thing a check needs -- it is an entry that
      //exists to talk to a dev server that is not running
      entry: typeof one.entry === 'object' && !Array.isArray(one.entry)
        ? one.entry
        : [].concat(one.entry).filter((e) => String(e).indexOf('hot-middleware') < 0)
    })))

    compiler.outputFileSystem = nowhere

    compiler.run((err, stats) => {
      if (err) return resolve([String((err && err.stack) || err)])

      const problems = []

      stats.stats.forEach((one) => {
        const info = one.toJson({ errors: true, all: false })

        ;(info.errors || []).forEach((e) => {
          problems.push((one.compilation.name || 'bundle') + ': ' +
            (e.message || e).split('\n').slice(0, 4).join('\n  '))
        })
      })

      compiler.close(() => resolve(problems))
    })
  })
}

//---- and everything no bundle contains ------------------------------------

// EVERY FILE THE APP READS OFF DISK AT RUNTIME. webpack never compiles these, so
// a stray bracket in one is an app that will not start -- discovered at launch,
// which is the slowest possible moment to find a typo.
function offDisk () {
  const files = [
    path.join(SRC, 'main.js'),
    path.join(SRC, 'cli.js'),
    path.join(SRC, 'boot.js'),
    path.join(SRC, 'roots.js'),
    path.join(SRC, 'gather.js'),
    path.join(SRC, 'target.js'),
    path.join(SRC, 'serve.js'),
    path.join(SRC, 'config.js')
  ].filter((f) => fs.existsSync(f))

  ROOTS.forEach((root) => {
    const tree = path.join(SRC, root)
    if (fs.existsSync(tree)) walk(tree, 2)
  })

  //the tools are read off disk too, and a broken one is found by running it,
  //which is exactly what somebody is trying to avoid
  fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => files.push(path.join(__dirname, f)))

  function walk (dir, left) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name[0] === '.' || entry.name === 'vendor') continue

      const here = path.join(dir, entry.name)

      //A PARKED FOLDER IS STILL CHECKED, and that is deliberate: `_example` is
      //what somebody copies to start a plugin, and the underscore that keeps it
      //from loading also keeps every other check off it.
      ;['main.js', 'cli.js', 'main.test.js', 'cli.test.js', 'node.test.js', 'sabotage.js']
        .forEach((name) => {
          const file = path.join(here, name)
          if (fs.existsSync(file)) files.push(file)
        })

      if (left > 1) walk(here, left - 1)
    }
  }

  const problems = []

  files.forEach((file) => {
    let source

    try {
      source = fs.readFileSync(file, 'utf8')

      //COMPILED, NOT RUN. `new vm.Script` parses and throws on a syntax error
      //without executing a line -- which matters, because running main.js here
      //would try to open a window.
      new vm.Script(source, { filename: file })
    } catch (e) {
      problems.push(path.relative(ROOT, file) + ': ' + ((e && e.message) || e))
      return
    }

    //AND PARSING IS NOT ENOUGH, which a sabotage found: a require pointing at a
    //file that is not there parses perfectly and fails at load. webpack catches
    //that for the two bundles; nothing was catching it for the half of the app
    //no bundle contains -- and a moved or renamed file is the single most
    //likely thing to break while plugins are being carried across.
    //
    //RELATIVE ONLY. A bare specifier is a package, and whether one is installed
    //is npm's question rather than this file's.
    const asked = source.match(/require\((['"])\.[^'"]*\1\)/g) || []

    asked.forEach((one) => {
      const to = one.slice(9, -2)

      try {
        require.resolve(path.resolve(path.dirname(file), to))
      } catch (e) {
        problems.push(path.relative(ROOT, file) + ": require('" + to + "') resolves to nothing")
      }
    })
  })

  return { problems, counted: files.length }
}

//---- say it ---------------------------------------------------------------

async function main () {
  const loose = offDisk()
  const bundled = await bundles()

  const problems = loose.problems.concat(bundled)

  if (!quiet) {
    console.log('checked 2 bundles and ' + loose.counted + ' files no bundle contains')
  }

  if (!problems.length) {
    console.log('compiles, in ' + ((Date.now() - began) / 1000).toFixed(1) + 's')
    process.exit(0)
  }

  //THE COUNT FIRST, because one error is a typo and forty is a rename that went
  //through half the app -- and those want different reactions.
  console.error('')
  console.error(problems.length + (problems.length === 1 ? ' problem' : ' problems') + ':')
  problems.forEach((one) => console.error('  x ' + one))

  process.exit(1)
}

main().catch((e) => {
  console.error((e && e.stack) || e)
  process.exit(2)
})
