// Break something on purpose, run the check that should notice, and put it back.
//
//   npm run sabotage                 every plugin's own list
//   npm run sabotage -- tts          one plugin's
//   npm run sabotage -- --list       what there is, without breaking anything
//
//   node tools/sabotage.js <file> <find> <replace> -- <command...>    one, by hand
//
// WHERE THE SABOTAGES LIVE IS THE POINT. Each one is knowledge about a
// particular plugin's tests -- which line, and which suite should go red when it
// is wrong -- so it sits in the plugin's folder as `sabotage.js`, beside the
// tests it is about and the README that explains them. This file is only the
// runner. ../CLAUDE.md has the rule; the plugins have the instances.
//
// WHY A TOOL AND NOT A SHELL LINE. "Sabotage the thing before trusting the test
// that watches it" is the rule this repo is built on, and doing it by hand went
// wrong three times in one afternoon, twice destructively:
//
//   sed with a pattern that quietly matched nothing, so the "sabotage" ran
//   against untouched code and the green result meant the opposite of what it
//   was read to mean
//
//   `git checkout <file>` to undo it, on a file whose changes were not committed
//   yet -- which restored to the last commit and deleted an hour of work along
//   with the sabotage
//
//   an interrupt between the edit and the undo, leaving broken code on disk that
//   read as a real regression on the next run
//
// So the backup is a COPY, never a commit, restored from a `finally` and from
// every signal that can end this process.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const shared = require('./selftest')
const ROOT = shared.ROOT

const argv = process.argv.slice(2)
const byHand = argv.indexOf('--')

//---- one sabotage ---------------------------------------------------------

// A SABOTAGE THAT CHANGES NOTHING IS THE WORST OUTCOME, because it looks exactly
// like a test that bites: the check runs against working code and passes, and
// the conclusion drawn is backwards. This is the failure that started the whole
// file -- a sed pattern with one wrong backslash.
function apply(target, find, replace) {
    const original = fs.readFileSync(target, 'utf8')
    const hits = original.split(find).length - 1

    if (hits === 0) throw new Error('nothing in ' + rel(target) + ' matches:\n    ' + find +
        '\n  that would run the check against working code and call it a pass.')

    if (hits > 1) throw new Error(hits + ' places in ' + rel(target) + ' match:\n    ' + find +
        '\n  sabotage one thing at a time, or the verdict does not name a cause.')

    return { original: original, broken: original.split(find).join(replace) }
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/')

//---- surviving a kill, which a signal handler does not -------------------
//
//THE SIGNAL HANDLERS BELOW ARE NOT ENOUGH, measured: a Ctrl-C from the harness
//running this ended the process without any of them firing, and left a file
//broken on disk. Whatever restores has to work when this process gets NO chance
//to run code at all.
//
//So the intent is written down BEFORE the file is touched: a note saying which
//file is about to be broken and where its copy is. Any later run reads that note
//first and puts things back. The recovery is somebody else's job, in a later
//process, which is the only kind that survives being killed.
const NOTE = path.join(os.tmpdir(), 'rectify-sabotage-in-progress.json')

function recover() {
    if (!fs.existsSync(NOTE)) return

    let pending = []
    try { pending = JSON.parse(fs.readFileSync(NOTE, 'utf8')) } catch (e) { pending = [] }

    pending.forEach((one) => {
        try {
            if (!fs.existsSync(one.backup)) return
            fs.writeFileSync(one.target, fs.readFileSync(one.backup, 'utf8'))
            fs.unlinkSync(one.backup)
            console.log('put ' + rel(one.target) + ' back -- a previous run was killed before it could')
        } catch (e) {
            console.error('could not put ' + one.target + ' back: ' + (e && e.message))
        }
    })

    fs.unlinkSync(NOTE)
}

function noting(target, backup, fn) {
    fs.writeFileSync(NOTE, JSON.stringify([{ target: target, backup: backup }]))
    try { return fn() } finally { try { fs.unlinkSync(NOTE) } catch (e) { /* already gone */ } }
}

// waiting on a file's mtime rather than on a clock: an incremental rebuild is
// 55-150ms and a cold one is seconds, and sleeping for either is wrong in both
// directions
function settled(what) {
    if (!what) return

    const watched = path.resolve(ROOT, what)
    const was = fs.existsSync(watched) ? fs.statSync(watched).mtimeMs : 0
    const until = Date.now() + 120000

    while (Date.now() < until) {
        const now = fs.existsSync(watched) ? fs.statSync(watched).mtimeMs : 0
        if (now > was) return
        spawnSync(process.execPath, ['-e', 'setTimeout(function () {}, 40)'])
    }

    console.error('  gave up waiting for ' + what + ' to rebuild')
}

// SOME FILES THE APP ONLY READS ONCE, AND WAITING FOR THEM IS WAITING FOR
// NOTHING.
//
// `settled` waits for a bundle's mtime to move, which is right for anything
// webpack rebuilds. It is meaningless for the two other kinds:
//
//   a main.js plugin   read off disk by the boot and never again, so the
//                      running app is still holding the copy from before the
//                      edit. Four core/state sabotages "survived" against an
//                      app that had never seen them.
//   a window.js file   measured: NOTHING on disk changes when the window bundle
//                      rebuilds -- webpack-dev-server serves it from memory and
//                      only dist/server.js is ever written.
//
// So an entry may say `restart: true` and get the one event that covers both:
// the app started again, with whatever is on disk now. It costs about four
// seconds, which is why it is asked for by name rather than always done.
function restarted () {
  const out = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'restart.js')], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000
  })

  // NOT FATAL, AND NOT SILENT. A restart that failed means the check is about
  // to run against whatever is or is not there, and the result is worth
  // distrusting rather than believing -- so say so and let it run.
  if (out.status !== 0) {
    console.error('  the app did not restart, so this result is about an app that may not have the change')
  }
}

// Runs the command with the file broken and puts it back whatever happens.
// Answers true when the check NOTICED, which is the outcome being looked for.
function tried(target, find, replace, command, wait, loud, limit, restart) {
    limit = limit || 90000
    let hung = false

    const { original, broken } = apply(target, find, replace)

    const backup = path.join(os.tmpdir(), 'sabotage-' + process.pid + '-' + path.basename(target))
    fs.writeFileSync(backup, original)

    let restored = false

    function restore() {
        if (restored) return
        restored = true

        try {
            fs.writeFileSync(target, fs.readFileSync(backup, 'utf8'))
            fs.unlinkSync(backup)
        } catch (e) {
            //the one thing worth shouting about: the copy is still on disk, named
            console.error('COULD NOT RESTORE ' + rel(target) + ' -- it is at ' + backup)
            console.error(e && e.message)
        }
    }

    //every way this process can end, not only the tidy one
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']
    const bail = () => { restore(); process.exit(130) }
    signals.forEach((signal) => process.on(signal, bail))

    let status = 1

    try {
        //the note is written before the file is, so a run that is killed between
        //the two leaves a note about a file it never broke -- harmless -- rather
        //than a broken file nothing knows about
        noting(target, backup, () => {
            fs.writeFileSync(target, broken)
            settled(wait)
            if (restart) restarted()

            //A CHECK THAT HANGS IS NOT A CHECK THAT PASSED, and it must not
            //take the run with it. A sabotage can easily produce a promise that
            //never settles rather than an assertion that fails -- deleting a
            //give-up timer does exactly that -- so the runner has its own.
            const out = spawnSync(command[0], command.slice(1), {
                stdio: loud ? 'inherit' : ['ignore', 'pipe', 'pipe'],
                cwd: ROOT,
                shell: process.platform === 'win32',
                timeout: limit
            })

            hung = out.error && out.error.code === 'ETIMEDOUT'
            status = out.status === null ? 1 : out.status
            restore()
        })
    } finally {
        restore()
        signals.forEach((signal) => process.removeListener(signal, bail))
        settled(wait)

        //AND AGAIN AFTERWARDS, or every later entry runs against an app still
        //holding the broken copy -- which reports them all as caught, by the
        //sabotage before them.
        if (restart) restarted()
    }

    return { caught: status !== 0, hung: hung }
}

//---- every plugin's own list ----------------------------------------------

function lists() {
    return shared.gather('sabotage.js').map((file) => ({
        //`named` strips a .test.js and this is not one, so the plugin's own name
        //is what is left after the filename comes off
        name: shared.named(file).replace(/\/sabotage\.js$/, ''),
        dir: path.dirname(file),
        entries: require(file)
    }))
}

//THREE OUTCOMES, NOT TWO. A check that HUNG did notice -- it never reached the
//end -- but it noticed in the way that is hardest to read, because a run that
//never finishes looks exactly like a run still going. It gets its own mark so
//the test can be given a timeout of its own and turned into a failure somebody
//can read. Found by a sabotage that deleted a give-up timer: the promise never
//settled, the suite never returned, and the whole set sat there.
function report(name, entry, outcome) {
    const mark = outcome.hung ? '  ~' : (outcome.caught ? '  ✔' : '  ✖')
    console.log(mark + ' ' + name + '  ' + entry.what)

    if (outcome.hung) {
        console.log('      `' + entry.check + '` never finished rather than failing --')
        console.log('      give that test a timeout, so the failure is one somebody can read')
    }

    if (!outcome.caught && !outcome.hung) {
        console.log('      ' + entry.file + ' was broken and `' + entry.check + '` still passed,')
        console.log('      so nothing there is watching it')
    }
}

function registry(only) {
    const found = lists().filter((one) => !only || one.name.includes(only))

    if (!found.length) {
        console.error(only ? 'no plugin called "' + only + '" carries a sabotage.js' : 'no sabotage.js anywhere')
        process.exit(2)
    }

    if (argv.includes('--list')) {
        found.forEach((one) => {
            console.log('\n' + one.name);
            one.entries.forEach((entry) => console.log('  ' + entry.what + '   (' + entry.file + ')'))
        })
        console.log('')
        return 0
    }

    let survived = 0
    let ran = 0

    found.forEach((one) => {
        one.entries.forEach((entry) => {
            const check = entry.check || one.name
            const target = path.join(one.dir, entry.file)

            ran++

            //A SABOTAGE THAT CANNOT BE APPLIED IS A FINDING TOO, and a loud one:
            //the line it names has been edited or deleted, so whatever it was
            //defending has been unguarded since then with nothing said.
            let outcome
            try {
                outcome = tried(target, entry.find, entry.replace,
                    ['node', 'tools/test.js', check], entry.wait, false, entry.limit, entry.restart)
            } catch (e) {
                console.log('  ✖ ' + one.name + '  ' + entry.what)
                console.log('      ' + String(e.message).split('\n').join('\n      '))
                survived++
                return
            }

            report(one.name, Object.assign({ check: check }, entry), outcome)
            if (!outcome.caught) survived++
        })
    })

    console.log('')
    if (survived) {
        console.log(survived + ' of ' + ran + ' survived -- those checks are watching nothing')
        return 1
    }

    console.log(ran + ' sabotages, all of them caught')
    return 0
}

//---- one, by hand ---------------------------------------------------------

function once() {
    const flags = argv.slice(0, byHand).filter((a) => a.startsWith('--'))
    const [file, find, replace] = argv.slice(0, byHand).filter((a) => !a.startsWith('--'))
    const command = argv.slice(byHand + 1)
    const wait = (flags.find((f) => f.startsWith('--wait=')) || '').slice('--wait='.length)

    // `--restart`, WHICH A REGISTRY ENTRY HAS AND THIS DID NOT.
    //
    // src/main.js and every main.js it loads are read OFF DISK when the app
    // starts and never again. So breaking one and running the check without a
    // restart runs the check against the code that is still in memory -- the
    // break is on disk, the app has never seen it, and the check passes.
    //
    // IT THEN PRINTS `SURVIVED`, which says "your check is watching nothing".
    // That is the wrong finding and it points at the wrong file: the check was
    // fine and the tool never delivered the break. Measured on
    // debug-snapshot/main.js, where it cost a real minute of looking at a test
    // that was never broken.
    const restart = flags.includes('--restart')

    if (!file || find === undefined || replace === undefined || !command.length) {
        console.error('usage: node tools/sabotage.js [--restart] [--wait=N] <file> <find> <replace> -- <command...>')
        return 2
    }

    // SAID BEFORE THE RUN RATHER THAN AFTER IT, because after it the answer is
    // already the wrong one and nothing about the output looks suspicious.
    if (!restart && /(^|[\/])main\.js$/.test(file)) {
        console.log('note: ' + file + ' is read off disk when the app starts. Without --restart '
            + 'the check runs against the code already in memory, and a real break reads as SURVIVED.')
    }

    const target = path.resolve(ROOT, file)
    if (!fs.existsSync(target)) { console.error('there is no ' + file); return 2 }

    let outcome
    try {
        outcome = tried(target, find, replace, command, wait, true, undefined, restart)
    } catch (e) {
        console.error(e.message)
        return 2
    }

    // INVERTED, and said in words as well as in the code, because a verdict a
    // reader has to remember the polarity of is one they will read backwards.
    if (outcome.hung) {
        console.log('\nHUNG -- the check never finished, which is noticing in the least readable way')
        return 0
    }

    if (outcome.caught) {
        console.log('\nCAUGHT -- the check failed while the code was broken, which is what it is for')
        return 0
    }

    console.log('\nSURVIVED -- the check passed with ' + file + ' broken, so it is watching nothing')
    return 1
}

//FIRST, WHATEVER THE LAST RUN LEFT BEHIND. Every invocation begins by putting
//back anything a killed run broke -- including `--list`, which is the one people
//reach for when they suspect something is wrong.
recover()

process.exit(byHand >= 0
    ? once()
    : registry(argv.filter((a) => !a.startsWith('--'))[0]))
