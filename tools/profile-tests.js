'use strict'

// What each test file costs, and what never finishes.
//
//   npm run profile
//   npm run profile -- --give-up=60     a longer leash for a slow machine
//
//---- NOT CALLED `test-profile.js`, AND THAT IS THE POINT --------------------
//
// NODE'S TEST RUNNER GLOBS `**/test-*.js` as well as `**/*.test.js`. Under that
// name this file would match -- so a bare `node --test` would RUN THE PROFILER
// as one of its own tests, which runs the suite again from inside the suite.
// ./test.js already passes explicit paths for the neighbouring half of this trap
// ("bare node --test globs across the whole project"), and being in tools/ is
// not enough on its own: the NAME has to miss the glob too.
//
//---- why this exists --------------------------------------------------------
//
// `npm test` says one number at the end, so "the suite is slow" is as much as
// anybody can tell from it. It was fifteen seconds this morning and is
// thirty-four now -- which is fine, and the point is that nothing anywhere says
// WHICH of the new files did that.
//
// A suite that gets slow enough stops being run, and a suite that stops being
// run stops being true.
//
//---- and the question `npm test` cannot answer ------------------------------
//
// A TEST FILE THAT NEVER EXITS DOES NOT FAIL. The runner waits, and if the thing
// that started it is killed the file goes on running by itself, competing for
// the same cores as everything measured afterwards. Both have happened here: a
// window suite that hung for 120s on a permission prompt nothing could answer,
// and a sabotage whose promise never settled.
//
// So a file that runs past the leash is reported as NEVER FINISHED rather than
// as slow -- and this names any leftovers it can see, without killing them.
// Killing by name is how an unrelated project got taken down here once already.

const path = require('node:path')
const { spawnSync } = require('node:child_process')

const runner = require('./test.js')

const ROOT = path.join(__dirname, '..')

const leash = Number((process.argv.find((a) => a.startsWith('--give-up=')) || '').slice(10)) || 90
const SLOW = 3000

//THE SAME LIST `npm test` RUNS, taken from ./test.js rather than rebuilt.
//`selftest.test.js` is included on purpose even though it is the expensive one:
//it is where most of the time goes, and leaving it out would make this a
//profile of the cheap half.
const files = runner.appFree().concat(path.join(runner.TESTS, runner.IN_APP))

function shortly (file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function run (file) {
  const began = Date.now()

  //ONE FILE PER PROCESS, which is the only way to attribute time at all: node's
  //runner interleaves files by default, and a shared process would blame
  //whichever one happened to be holding the cpu.
  const out = spawnSync(process.execPath, ['--test', file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: leash * 1000
  })

  const took = Date.now() - began
  const hung = out.error && out.error.code === 'ETIMEDOUT'

  //`ℹ pass N` / `ℹ fail N` is what the runner prints; reading it back is
  //cheaper than parsing tap and does not care which reporter is default
  const text = String(out.stdout || '') + String(out.stderr || '')
  const passed = /ℹ pass (\d+)/.exec(text)
  const failed = /ℹ fail (\d+)/.exec(text)

  return {
    file: shortly(file),
    ms: took,
    hung: hung,
    passed: passed ? Number(passed[1]) : 0,
    failed: failed ? Number(failed[1]) : (out.status === 0 ? 0 : 1)
  }
}

//---- leftovers --------------------------------------------------------------

// ANYTHING STILL RUNNING FROM A PREVIOUS GO. Named, never killed -- and matched
// on the command line rather than the image name, because `node` belongs to more
// than one thing on a developer's machine.
function leftovers () {
  if (process.platform !== 'win32') return []

  const out = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*--test*' } | " +
    "ForEach-Object { $_.ProcessId.ToString() + ' ' + $_.CommandLine }"
  ], { encoding: 'utf8' })

  return String(out.stdout || '').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.indexOf(ROOT) >= 0)
    .filter((line) => line.indexOf(String(process.pid)) !== 0)
}

//---- go ---------------------------------------------------------------------

const before = leftovers()

if (before.length) {
  console.log('')
  console.log(before.length + ' test process' + (before.length === 1 ? '' : 'es') +
    ' from an earlier run are still going:')
  before.forEach((one) => console.log('  ' + one.slice(0, 110)))
  console.log('  (they are competing for the same cores -- not killed here, that is yours to do)')
}

console.log('')
console.log('timing ' + files.length + ' files, one process each, giving up after ' + leash + 's')
console.log('')

const results = []

files.forEach((file) => {
  process.stdout.write('  ' + shortly(file).padEnd(46))
  const one = run(file)
  results.push(one)

  if (one.hung) console.log('NEVER FINISHED')
  else console.log((one.ms + 'ms').padStart(8) + '   ' + one.passed + ' pass' +
    (one.failed ? ', ' + one.failed + ' FAIL' : ''))
})

const total = results.reduce((sum, one) => sum + one.ms, 0)
const hung = results.filter((one) => one.hung)
const slow = results.filter((one) => !one.hung && one.ms >= SLOW).sort((a, b) => b.ms - a.ms)

console.log('')
console.log((total / 1000).toFixed(1) + 's over ' + files.length + ' files, run one at a time')

//SUMMED SEPARATELY FROM WHAT `npm test` TAKES, because that runs them together
//and the wall clock is not the sum. What this is for is which file is
//expensive, not what the suite costs.
if (slow.length) {
  console.log('')
  console.log('the expensive ones:')
  slow.forEach((one) => console.log('  ' + (one.ms + 'ms').padStart(8) + '  ' + one.file))
}

if (hung.length) {
  console.log('')
  console.log(hung.length + ' never finished, which is not the same as slow:')
  hung.forEach((one) => console.log('  x ' + one.file))
  console.log('  a file that does not exit does not fail -- the runner just waits')

  //A LEASH SHORTER THAN THE SLOWEST FILE REPORTS THAT FILE AS HUNG, which is
  //true and misleading at once. Saying the number back is cheaper than guessing
  //which of the two a reader is looking at.
  console.log('  (the leash was ' + leash + 's -- raise it with --give-up if one legitimately takes longer)')
  process.exit(1)
}

const broke = results.filter((one) => one.failed)

if (broke.length) {
  console.log('')
  console.log(broke.length + ' had failures -- this is a profiler, run `npm test` to read them')
  process.exit(1)
}

process.exit(0)
