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
// was the one that started it -- but only when the running app is the one that
// was asked for. Driving the source tree while being told --package is a pass
// about the wrong app.

const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

// The cli graph, the walk, the launcher and the wait all live in ./selftest.js,
// because test/selftest.test.js needs the same four and two copies of them
// would drift the first time either was fixed.
const shared = require('./selftest')



const NEWLINE = String.fromCharCode(10)
const ROOT = shared.ROOT
const SHOTS = path.join(ROOT, 'shots')

const OPTIONS = ['--shots', '--swatches', '--selftest', '--closed']

// WHICH PAGE A SWATCH IS JUDGED ON. See swatches() for why it is pinned.
const MEASURE_ON = 'Cheatsheet'
const passthrough = process.argv.slice(2).filter(a => OPTIONS.indexOf(a) < 0)
const wantShots = process.argv.includes('--shots')
const everySwatch = process.argv.includes('--swatches')
const wantSelftest = process.argv.includes('--selftest')

// DRIVE THE OTHER STANCE, WHICH IS THE ONE NOBODY WOULD OTHERWISE RUN.
//
// A closed build behaves differently from every build a developer starts, and
// until this flag the only way to get one was `npm run dist` plus
// `--package` -- about four minutes, so about once a release. That is the exact
// shape of the rules this codebase has had to move out of closures after their
// own sabotage survived.
//
// APP_OPEN IS READ WHEN THE BUILD IS MADE AND BY NOTHING ELSE -- see
// src/stance.js. spawnSync inherits the environment, tools/nw.js spawns nw the
// same way, and src/app/core/build/main.js runs webpack INSIDE that nw process,
// so one variable reaches the off-disk boot and all three bundles at once.
const wantClosed = process.argv.includes('--closed')

if (wantClosed) {
  process.env.APP_OPEN = '0'

  // AND THE DRIVER ON ITS OPEN LIST, or there is nothing to check BEHIND the
  // lock. A closed build shuts the door twice: the open list decides which
  // commands answer, and the Reachable marks decide which controls the driver
  // may touch. Without this the run would prove the first and could not reach
  // the second -- and the second is the one that does the protecting.
  //
  // A SHIPPED BUILD DOES NOT GET THIS. It is a constant, folded out, and the
  // four names are not in the bundle -- measured by building both ways and
  // grepping. See src/stance.js#driveable.
  process.env.APP_DRIVEABLE = '1'
}

// THE STANCE THE APP ACTUALLY CAME UP IN, asked rather than assumed -- see the
// note by `stance` in main().
let isClosed = false

// AND WHETHER THE DRIVER IS ON ITS OPEN LIST -- see where this is set, in main().
let canDrive = true

//the app has to be started with it too: it decides at boot whether to load its
//own test plugins, and the window is told by the url it is opened with
const packaged = passthrough.includes('--build') || passthrough.includes('--package')
if (wantSelftest && !packaged) passthrough.push('--selftest')

// WCAG's floor for body text. Large text is allowed 3, and nothing here checks
// font size, so this is the strict reading on purpose.
const READABLE = 4.5

let passed = 0
const failures = []
const skipped = []

// STOPPED BY PID AND NOT OVER IPC. `quit` is not on a closed build's open list,
// so `ipc.call('quit')` is refused -- which would leave a closed app running
// and every `npm test` after this one failing for a reason nobody would connect
// to a drive run. tools/stop.js signals the pid out of .nw-instance.json, which
// no stance can refuse.
function stopIt () {
  spawnSync(process.execPath, [path.join(__dirname, 'stop.js')], { stdio: 'ignore', cwd: ROOT })
}

// A SKIP IS NEITHER A PASS NOR A FAILURE, and reporting it as one of them is
// how a run lies. `--shots` against a minimized window used to fail the page it
// could not photograph, which reads as a broken page rather than as a window
// that is not on screen.
function skip (what, why) {
  skipped.push(what + (why ? '  -- ' + why : ''))
  console.log('  - ' + what + (why ? '  ' + why : ''))
}

function check (what, ok, detail) {
  if (process.env.DRIVE_LIST) console.log('  . ' + what)
  if (ok) { passed++; return true }
  failures.push(what + (detail ? '  -- ' + detail : ''))
  console.log('  x ' + what + (detail ? '  ' + detail : ''))
  return false
}

function note (line) { console.log(line) }

async function main () {
  const { app, ipc, selftest: cli } = await shared.cliGraph({ withTests: wantSelftest })

  let wasRunning = await ipc.running()

  // THE STANCE IS BAKED WHEN THE APP BOOTS, so an app that is already up is the
  // wrong app whatever it is: it was started without APP_OPEN and its bundles
  // carry the other constant. Stop it and start one that is the thing asked for.
  //
  // AND PUT IT BACK AFTERWARDS. Leaving a closed app running would mean the next
  // `npm test` fails -- `selftest` is not on the open list -- for a reason nobody
  // would connect to a drive run they had already forgotten about.
  let restoreOpen = false

  if (wantClosed && wasRunning) {
    note('stopping the open app, and putting it back at the end')
    stopIt()
    restoreOpen = true
    wasRunning = false
  }

  if (!wasRunning) {
    note('starting the app' + (passthrough.length ? ' (' + passthrough.join(' ') + ')' : ''))

    // tools/nw.js already knows how to wait and how to report a boot that
    // throws, so this does not reimplement either
    if (!shared.start(passthrough)) {
      console.log('\nit did not start, so there is nothing to drive')
      process.exit(1)
    }
  } else {
    note('driving the app that is already running')

    // AND IT HAS TO BE THE APP THAT WAS ASKED FOR.
    //
    // Reusing whatever is on the socket is right when the two agree and a lie
    // when they do not: `npm run drive -- --package` against a running dev app
    // drove the source tree, printed "119 checks passed", and said nothing
    // about the packaged build it had been asked to test. A pass that is about
    // something else is worse than a failure.
    //
    // The app answers this about itself, and `health` is MAIN's answer -- see
    // src/app/core/lifecycle/main.js. This asked `hello` until now, which is
    // registered by src/app/demo/server.js: a core tool depending on the one
    // folder the scaffold promises you can delete, and answered by the half
    // that is missing in every case worth diagnosing.
    const info = await ipc.call('health')
    if (!!info.packaged !== packaged) {
      console.log(NEWLINE + 'you asked to drive ' + (packaged ? 'a packaged build' : 'the source tree') +
        ', and the app already running is ' + (info.packaged ? 'packaged' : 'running from source') + '.')
      console.log('close it first (node src/cli.js quit), or drop the flag.')
      process.exit(1)
    }
  }

  // IS THE APP FACE DOWN, BEFORE ANYTHING ELSE IS MEASURED.
  //
  // src/overlay.js draws a red box over the page when something fails
  // underneath the ui, and nothing looked for it -- so a run could open twelve
  // pages behind that box and report a hundred and forty green checks about an
  // app that never came up. A picture is not a check.
  //
  // ASKED OF MAIN, WHICH IS THE ONLY HALF THAT CAN ANSWER. A check that read
  // the DOM through `read` was written first and measured against both ways the
  // overlay is raised: a failed server reload takes remote/SERVER.js with it,
  // and a window plugin throwing takes remote/WINDOW.js -- so `read` has no
  // handler in one and no responder in the other, and drive died on a stack
  // trace both times. main is loaded once, off disk, and survives both.
  const state = await ipc.call('health').catch(() => null)
  const trouble = state && state.window ? state.window.trouble : null

  check('the app is not showing an error overlay', !trouble,
    trouble ? trouble.split(NEWLINE)[0] : 'nothing on top of the page')

  // AND IT STOPS HERE IF IT IS. Everything after this measures a page that is
  // still on screen and no longer attached to anything, and answers about that
  // are worse than no answers -- they are green.
  if (trouble) {
    console.log(NEWLINE + trouble)
    console.log(NEWLINE + 'the app is showing an error overlay, so there is nothing worth measuring.')
    return finish(wasRunning, ipc, restoreOpen)
  }

  // WHICH STANCE THIS ACTUALLY IS, ASKED RATHER THAN ASSUMED.
  //
  // `--closed` sets an environment variable and hopes; this is the part that
  // checks it landed. A dev build booted closed rebuilds its bundles as it
  // starts, and driving through a stale one would measure the other app --
  // main() already refuses `--package` against a running dev build for exactly
  // this reason, and the sentence there is the one that applies: a pass that is
  // about something else is worse than a failure.
  //
  // `may` IS ON THE SHIPPED OPEN LIST precisely so this works in a closed build.
  const said = await ipc.call('may').catch(() => null)
  const reach = said && said.reach

  if (!reach) {
    check('the app says which stance it is in', false,
      'nothing answered `may`, so there is no way to know what is being driven')
    return finish(wasRunning, ipc, restoreOpen)
  }

  isClosed = !reach.open

  // AND WHETHER THERE IS ANYTHING TO DRIVE WITH. A package built the normal way
  // ships without `views`, `click`, `fill` and `read` on its open list -- so
  // everything below that touches the page has nothing to touch it through, and
  // saying so once here is better than sixty failures that all mean this.
  canDrive = !isClosed || reach.lists.commands.indexOf('click') >= 0

  if (wantClosed && !isClosed) {
    console.log(NEWLINE + 'you asked to drive a closed build and this one is open.')
    console.log('APP_OPEN did not reach it -- see src/stance.js, and check that',
      'nothing else started the app first.')
    stopIt()
    process.exit(1)
  }

  note('this build is ' + (isClosed ? 'closed' : 'open'))

  // "up" from tools/nw.js means the server is listening, which is earlier than
  // the window having loaded and opened its socket. Driving needs the second
  // one, so wait for it rather than assuming the first implies it.
  const views = await shared.waitForView(ipc)

  // AND WHEN IT DOES NOT, SAY WHAT MAIN KNOWS.
  //
  // `0 connected` is a symptom and not a diagnosis. `views` is answered by
  // src/app/remote/server.js -- the NODE half -- so a node half that failed to
  // load answers nothing and the count is zero whether or not there is a
  // window. Main is loaded once and off disk, and it can still see the window,
  // which is exactly the fact that tells those two apart.
  // AND A BUILD THAT LISTS NO DRIVER CANNOT BE ASKED. `views` is one of the four
  // driver commands, so a package that ships shut answers it with a refusal and
  // this would read `0 connected` -- a window that is plainly there, reported as
  // missing. Measured on the first shut package built.
  if (!canDrive) skip('a view connects', 'this build lists no driver, so nothing can ask')
  else check('a view connects', views.views.length > 0,
    views.connected + ' connected' +
    (state && state.window && state.window.attached
      ? ' -- but main still has a window attached, so the window is not what is missing:'
        + ' nothing answered `views`, which is what a node half that failed to load looks like.'
        + ' npm run log has the throw.'
      : ''))

  if (canDrive && !views.views.length) return finish(wasRunning, ipc, restoreOpen)

  if (canDrive) note('driving ' + (views.views[0].title || 'the window'))


  // A GUARDED CONTROL MUST REFUSE THE ONE THING THIS TOOL DOES.
  //
  // Everything below drives the app with events it builds itself, and the
  // browser marks every one of those untrusted -- see fire() in
  // src/app/remote/window.js. src/app/core/may refuses a press that is not a
  // person's, so THIS RUN is the adversary that check exists for.
  //
  // IT IS A CHECK AND NOT A COMMENT because the alternative is a guard that
  // looks right in a screenshot. If a driven press ever gets through, the mark
  // on that control has been promising something the app does not do -- which is
  // the exact failure the plugin it came from warns about and does not close.
  if (canDrive) await guarded(ipc)
  else skip('a guarded control refuses a driven press', 'this build lists no driver')

  await stance(ipc, reach)

  // AND EVERYTHING BELOW REACHES INTO THE PAGE, which a build that lists no
  // driver cannot do at all. The command-level checks above are the whole of
  // what such a build CAN be asked, and they are the ones that matter about it.
  if (!canDrive) {
    note(NEWLINE + 'this package lists no driver, so the marks behind the lock were not checked.')
    note('`APP_DRIVEABLE=1 npm run dist` builds the one those are measured on.')
    skip('every page opens', 'this build lists no driver')
    return finish(wasRunning, ipc, restoreOpen)
  }

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

    // THE PROSE ITSELF, WHICH NOTHING HERE MEASURED UNTIL NOW.
    //
    // Headings, muted text, code and the sidebar were each checked because each
    // had been found wrong -- and the plain paragraph between them, the thing
    // most of this app is made of, was never asked. minty ships
    // --bs-body-color: rgb(136,136,136), which is 3.54:1 on its own white, so
    // every <p> in the app was under the floor on that swatch while 278 checks
    // passed. A check that only looks at what was fixed last time will keep
    // finding what was fixed last time.
    await readable(ipc, page, 'main p', 'prose')
    await readable(ipc, page, 'main .text-body-secondary', 'muted text')

    // INLINE CODE, WHICH THIS DID NOT LOOK AT AND SHOULD HAVE. bootstrap pins it
    // to one fixed colour whatever the swatch is: 3.82:1 on plain white and
    // 1.49:1 inside an alert on flatly, on four pages, for as long as those pages
    // have existed. A check that measures headings and muted text and nothing
    // else will keep finding headings and muted text.
    await readable(ipc, page, 'main code', 'inline code')

    // AND THE ALERTS THEY SIT IN. Found the same way: code inside one measured
    // 1.6:1 and the alert's own text measured the same, because the code was
    // faithfully inheriting a colour that was already wrong.
    await readable(ipc, page, 'main .alert', 'alerts')

    if (wantShots) {
      const file = path.join(SHOTS, page.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png')
      const shot = await ipc.call('capture', { path: file }, 20000).catch(e => ({ error: e.message }))

      //the app says whether there was a frame to take; only an error is a failure
      if (shot.skipped) skip(page + ': photographs', shot.why)
      else check(page + ': photographs', !shot.error, shot.error || (Math.round(shot.bytes / 1024) + ' kb'))
    }
  }

  await swatches(ipc)
  await selftest(ipc, cli)
  await finish(wasRunning, ipc, restoreOpen)
}

// THE TWO CONTEXTS THAT CANNOT BE BOOTED FROM A TEST FILE.
//
// main needs nw around it and window needs a document, so neither can be built
// in a test process -- which is not the same as them being untestable. The
// running app is already in both. It loads its own main.test.js and
// window.test.js when started with --selftest, runs them in place, and hands
// the results back over the same socket everything else here uses.
async function selftest (ipc, cli) {
  if (!wantSelftest) return

  //a packaged build has no path that loads its own tests -- the require.context
  //for them sits inside a check webpack drops, and main.prod.js has no
  //equivalent at all. Asking anyway would report three empty contexts as three
  //failures, which reads as a fault rather than as the design.
  if (packaged) {
    note(NEWLINE + 'a packaged build carries no tests to run -- that is the point of it')
    return
  }

  //this process first, since its graph is already built and holding the suites
  const here = await cli.run({ log: () => {} })
  report('cli', here)

  note(NEWLINE + 'asking the app to test itself')
  const out = await ipc.call('selftest', {}, 60000).catch(e => ({ error: e.message }))

  if (out.error) return void check('the app runs its own suites', false, out.error)

  for (const context of out.contexts) report(context.context, context)
}

function report (name, results) {
  if (results.missing) return void check(name + ': runs its own suites', false, results.missing)

  const ran = results.suites.reduce((n, suite) => n + suite.tests.length, 0)
  check(name + ': runs its own suites', ran > 0, ran + ' in ' + results.suites.length + ' suites')

  for (const suite of results.suites) {
    for (const one of suite.tests) {
      check(name + ' -- ' + suite.name + ' -- ' + one.name, one.ok,
        one.error && String(one.error).split(NEWLINE)[0])
    }
  }
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

  // ON A PAGE CHOSEN ON PURPOSE, rather than on whichever one the loop above
  // happened to end on.
  //
  // `readable` skips a group that matches nothing, so this pass only measured
  // what the last page happened to contain -- and adding a page to the end of
  // the sidebar silently changed what every swatch was checked for. Measured:
  // the run ended on Graph, which has inline code and alerts, until a plugin
  // registered a page after it that has neither, and six checks disappeared
  // without a word. 122 became 121 and nothing said which two groups had
  // stopped being looked at.
  //
  // Cheatsheet is the richest page in the demo -- every component, every
  // variant -- so it is the one worth measuring a swatch against. Falling back
  // to whatever is open keeps this working for an app that deleted the demo.
  const landed = await ipc.call('click', { selector: '.app-sidebar .nav-pills .nav-link', text: MEASURE_ON })
    .catch(() => ({ error: 'no ' + MEASURE_ON + ' page' }))

  if (landed.error) note('  - swatches measured on whatever was open: ' + landed.error)
  else await settled(ipc)

  // one plain, one dark design, one that restyles everything
  const chosen = everySwatch ? names : names.filter(n => ['default', 'darkly', 'sketchy'].indexOf(n) >= 0)
  note(NEWLINE + chosen.length + ' swatches: ' + chosen.join(', ') + NEWLINE)

  for (const name of chosen) {
    const set = await ipc.call('fill', { selector: '.navbar select', value: name }).catch(e => ({ error: e.message }))
    if (!check('swatch ' + name + ': applies', !set.error, set.error)) continue

    await settled(ipc)

    await readable(ipc, 'swatch ' + name, 'main h1, main h2, main h4', 'headings')
  await readable(ipc, 'swatch ' + name, 'main p', 'prose')
    await readable(ipc, 'swatch ' + name, 'main .text-body-secondary', 'muted text')
    await readable(ipc, 'swatch ' + name, 'main code', 'inline code')
    await readable(ipc, 'swatch ' + name, 'main .alert', 'alerts')
    await readable(ipc, 'swatch ' + name, '.navbar-brand', 'the brand')
    await readable(ipc, 'swatch ' + name, '.app-sidebar .nav-pills .nav-link', 'the sidebar')
  }

  await ipc.call('fill', { selector: '.navbar select', value: 'default' }).catch(() => {})
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
// PRESS A GUARDED CONTROL THE WAY EVERYTHING ELSE HERE PRESSES THINGS, and
// require it to refuse. The demo's Buttons page carries one; if the demo has
// been deleted there is nothing to press, which is a skip and not a pass.
// WHAT A `read` FOUND, WHICHEVER SHAPE IT CAME BACK IN.
//
// It answers `{ items: [...] }` for several matches and a FLAT `{ text }` for
// exactly one -- so code that only knows about `items` sees a single match as
// nothing at all. That is what made the check below report "it said nothing",
// with the refusal sitting on screen the whole time.
function saw (out) {
  if (!out) return []
  if (out.items && out.items.length) return out.items.map(one => one.text || '')
  if (typeof out.text === 'string') return [out.text]
  return []
}

async function guarded (ipc) {
  // THE SIDEBAR HAS TO EXIST FIRST, and `waitForView` does not mean it does:
  // that waits for a socket, which the page opens before react has drawn
  // anything. Clicking into that gap does not fail -- `click` reports that it
  // matched nothing and this read it as success, then spent six seconds looking
  // for a guarded control on a page that had never been opened.
  let sidebar = null

  for (let tries = 0; tries < 40; tries++) {
    sidebar = await ipc.call('read', { selector: '.app-sidebar .nav-pills .nav-link' }).catch(() => null)
    if (sidebar && sidebar.items && sidebar.items.length) break
    await new Promise(r => setTimeout(r, 150))
  }

  if (!sidebar || !sidebar.items || !sidebar.items.length) {
    return skip('a guarded control refuses a driven press', 'the sidebar never drew')
  }

  // WHICH GUARDED CONTROL, AND IT DEPENDS ON THE STANCE.
  //
  // A closed build refuses everything outside a marked region BEFORE the guard
  // is ever asked -- so aiming at the Buttons page here would measure the stance
  // refusing and report it as a guard that never asked anybody. The demo carries
  // one control that is both marked open AND guarded, exactly so this pass keeps
  // meaning the same thing in either build: reached, and then asked about.
  const on = isClosed ? 'Guarded' : 'Buttons'
  const target = isClosed
    ? { selector: '#guarded-and-reachable' }
    : { text: 'Write the page to a file' }

  if (!sidebar.items.some(item => item.text === on)) {
    // the demo is deletable, and this check is about the demo's own page
    return skip('a guarded control refuses a driven press', 'no ' + on + ' page to look at')
  }

  await ipc.call('click', {
    selector: '.app-sidebar .nav-pills .nav-link', text: on
  }).catch(() => null)

  // WAITED FOR RATHER THAN SLEPT THROUGH. A fixed pause is right until the
  // machine is busy, which is the one time a run like this is happening.
  let marked = []

  for (let tries = 0; tries < 40; tries++) {
    marked = saw(await ipc.call('read', { selector: '.is-guarded' }).catch(() => null))
    if (marked.length) break
    await new Promise(r => setTimeout(r, 150))
  }

  if (!marked.length) {
    // WHAT IT WAS LOOKING AT WHEN IT FOUND NOTHING. "nothing is drawn guarded"
    // is a symptom; the page it was on while deciding that is the diagnosis.
    const on = saw(await ipc.call('read', { selector: '.app-sidebar .nav-link.active' }).catch(() => null))
    const where = on.length ? on[0] : 'nowhere it could name'

    return check('a guarded control is marked as one', false,
      'nothing on the page is drawn guarded, and it was looking at ' + where)
  }

  check('a guarded control is marked as one', true, marked.length + ' of them')

  // AND LET THE PAGE STOP MOVING BEFORE PRESSING ANYTHING ON IT. The mark being
  // in the dom is not the same as react having finished with the page it is on,
  // and a press into that gap did nothing at all -- no refusal, no toast, which
  // reads exactly like a guard that is not working.
  await settled(ipc)

  const pressed = await ipc.call('click', target).catch(e => ({ error: e.message }))

  // A REFUSAL HERE IS NOT A FAILURE, AND READING IT AS ONE WAS A BUG I WROTE.
  //
  // The expected answer to this press IS `{ refused }`: remote/window.js raises
  // the question, waits 2.5s for somebody to answer it, and refuses the CALLER
  // with "a question is on screen" rather than holding the socket open for two
  // minutes. The dialog appearing is the thing being checked, so the dialog is
  // what decides -- and the refusal is only worth keeping as the detail for when
  // there is no dialog to find.
  //
  // A REJECTION IS STILL A FAILURE, because that is the transport breaking
  // rather than the app answering.
  if (pressed && pressed.error) {
    return check('a guarded control refuses a driven press', false, pressed.error)
  }

  // A DRIVEN PRESS RAISES A QUESTION RATHER THAN DOING THE THING, which is the
  // whole point of a guarded control: an outside caller gets a way to ASK, and
  // a person answers. This tool is exactly such a caller.
  let box = null

  for (let tries = 0; tries < 40; tries++) {
    box = saw(await ipc.call('read', { selector: '#may-asking' }).catch(() => null))
    if (box.length) break
    await new Promise(r => setTimeout(r, 150))
  }

  check('a driven press asks a person instead of going ahead', box.length > 0,
    box.length ? box[0].slice(0, 60)
      : ((pressed && pressed.refused) ||
        'nothing was asked, so it either refused or just did it'))

  if (!box.length) return

  // AND THIS RUN CANNOT ANSWER IT YES. Every event this tool makes is one the
  // browser marks untrusted, so pressing "Always" must leave the question up --
  // otherwise one driven press raises the dialog and a second gets through it.
  // "JUST THIS ONCE" AND NOT "ALWAYS", because `once` is never written down.
  // If the check this is testing were broken, pressing "Always" here would grant
  // the capability permanently in the real app -- a drive run leaving a standing
  // permission behind is a worse outcome than the failure it was looking for.
  await ipc.call('click', { text: 'Just this once' }).catch(() => null)
  await new Promise(r => setTimeout(r, 300))

  const after = saw(await ipc.call('read', { selector: '#may-asking' }).catch(() => null))

  check('and cannot answer its own question', after.length > 0,
    'a press the browser called untrusted allowed something')

  // BUT IT MAY ALWAYS SAY NO, and it has to -- a dialog only a person can
  // dismiss would leave every run after this one staring at a modal.
  await ipc.call('click', { text: 'Not now' }).catch(() => null)
  await new Promise(r => setTimeout(r, 300))

  const gone = saw(await ipc.call('read', { selector: '#may-asking' }).catch(() => null))
  check('and can always take the question away', !gone.length, 'the dialog would not go')
}

// WHAT A CLOSED BUILD REACHES, AND WHAT IT WILL NOT.
//
// THE OTHER HALF OF `guarded` ABOVE. That one is about a capability somebody
// can allow; this is about a build that reaches nothing except what was listed
// before it shipped, and cannot be talked out of it.
//
// IT IS THE ONLY PLACE THE CLOSED BRANCH IS EXERCISED END TO END. Everything
// else about the stance is a node test on src/stance.js and
// src/app_plugins/mcp/showing.js -- correct rules, asked both ways in a
// millisecond, and no proof at all that they are WIRED to anything.
async function stance (ipc, reach) {
  if (!isClosed) {
    return skip('a closed build reaches only what it listed',
      'this build is open -- run `npm run drive -- --closed`')
  }

  // THE LISTING AGREES WITH THE GATE. `commands` is the first thing anything
  // driving an app asks for, and a caller that may not use one has no business
  // being told it is there.
  const listed = await ipc.call('commands').catch(() => null)

  check('the listing names only what is open', Array.isArray(listed) &&
    listed.length === reach.lists.commands.length && listed.length < reach.counts.commands,
    (listed || []).length + ' listed, ' + reach.lists.commands.length + ' open, ' +
    reach.counts.commands + ' registered')

  // AND AN UNLISTED ONE IS REFUSED, saying where to look. `snapshot` is a real
  // command in this app -- it writes the screen to a file -- and is not open.
  const shut = await ipc.call('snapshot').then(() => null, e => e.message)

  check('an unlisted command is refused', !!shut && /config\.may\.open/.test(shut),
    shut || 'it ran')

  // THE ONE THAT MAKES THE LIST WORTH HAVING. A refused command and a
  // nonexistent one have to answer the SAME, or a caller can tell them apart
  // and learn the whole surface a name at a time.
  const nonsense = await ipc.call('no-such-command-at-all').then(() => null, e => e.message)

  check('and answers the same as a command that does not exist',
    !!nonsense && nonsense.replace(/no-such-command-at-all/g, 'X') === String(shut).replace(/snapshot/g, 'X'),
    'refused: ' + shut + ' / unknown: ' + nonsense)

  // MCP IS SHUT TWICE, and this is the outer one: `mcp:call` is not a listed
  // command either, so a closed build offers a model nothing at all before the
  // per-tool hiding is even reached.
  const mcp = await ipc.call('mcp:describe').then(() => null, e => e.message)
  check('the MCP surface is shut at the socket', !!mcp, mcp || 'it answered')

  // ---- and the marks, which are the half with pixels --------------------
  //
  // ON THE DEMO'S OWN PAGE, because that is where a control inside a region and
  // one outside it sit side by side on purpose. `skip` rather than fail if the
  // demo is gone: it is deletable, and this is the demo's markup.
  if (!canDrive) {
    return skip('a control outside every open region refuses',
      'this build lists no driver, so nothing can reach the page to be refused')
  }

  const nav = await ipc.call('read', { selector: '.app-sidebar .nav-pills .nav-link' }).catch(() => null)
  const pages = ((nav && nav.items) || []).map(one => one.text)

  if (pages.indexOf('Guarded') < 0) {
    return skip('a control outside every open region refuses', 'no Guarded page to look at')
  }

  await ipc.call('click', { selector: '.app-sidebar .nav-pills .nav-link', text: 'Guarded' })
    .catch(() => null)
  await settled(ipc)

  // NAVIGATION ITSELF PROVED THE SIDEBAR IS REACHABLE, which is not a given: it
  // is a marked region in src/app/demo/window.js, and a closed build with that
  // mark removed could not be driven to a second page at all.
  const where = await ipc.call('read', { selector: '.app-sidebar .nav-link.active' }).catch(() => null)
  check('a marked region can still be driven', where && where.text === 'Guarded',
    'the active page is ' + ((where && where.text) || 'unreadable'))

  const marks = saw(await ipc.call('read', { selector: '.is-open' }).catch(() => null))
  check('the open marks are drawn', marks.length > 0,
    marks.length + ' marked, and the driver obeys the same class')

  // BOTH DIRECTIONS, AND THE SECOND ONE IS NOT PADDING. A stance that refused
  // everything would pass every refusal check above and leave the app unusable,
  // which is a failure no list of refusals can see.
  // A REFUSED VERB IS A SUCCESSFUL IPC REPLY, WHICH IS NOT THE SAME AS A REFUSED
  // COMMAND. The gate in core/ipc answers `ok: false` and `ipc.call` rejects; a
  // verb that refuses has ALREADY been let through the gate and answers
  // `{ refused }` with `ok: true`. Reading only the rejection scores a refusal
  // as a press -- measured, right here: this check passed the stance and then
  // reported that an unmarked control had been pressed when it had not.
  //
  // It is the same blind spot remote/cli.js had, which its own sabotage found by
  // surviving. Two layers, two shapes of no.
  const outside = await ipc.call('click', { selector: '#not-reachable' })
    .then(out => (out && out.refused) || null, e => e.message)

  check('a control outside every open region refuses',
    !!outside && /closed/.test(outside), outside || 'it was pressed')

  const inside = await ipc.call('click', { text: 'Inside the region' })
    .then(out => out || {}, e => ({ error: e.message }))

  check('and one inside a marked region is pressed', !inside.error && !inside.refused,
    inside.error || inside.refused || 'pressed')

  // READ IS THE VERB THAT IS NOT SHUT OUTRIGHT, and the split is where the risk
  // is: the values are what leaked, the shape is what keeps a package
  // diagnosable and is what every contrast check above is made of.
  const seen = await ipc.call('read', { selector: '#not-reachable' }).catch(() => null)

  check('read still says what a thing is', seen && !!seen.text && !!seen.contrast,
    seen ? 'text and contrast came back' : 'nothing came back at all')

  check('and withholds what is in it, saying so',
    seen && seen.value === null && !!seen.withheld,
    seen ? 'value=' + JSON.stringify(seen.value) + ' withheld=' + !!seen.withheld : 'no answer')

  // AND THE SCREEN THAT SAYS ALL OF IT AGREES WITH THE APP. This is where
  // ui/reachable's region reader is actually covered -- its own sabotage entry
  // for pointing at the wrong class cannot fail in an open build, because there
  // are no marks to miscount and both answers are zero.
  if (pages.indexOf('Reachable') >= 0) {
    await ipc.call('click', { selector: '.app-sidebar .nav-pills .nav-link', text: 'Reachable' })
      .catch(() => null)
    await settled(ipc)

    const rows = saw(await ipc.call('read', { selector: 'main tbody tr' }).catch(() => null))
    const onPage = saw(await ipc.call('read', { selector: '.is-open' }).catch(() => null))

    check('the Reachable page counts the marks that are really there',
      rows.length >= onPage.length && onPage.length > 0,
      onPage.length + ' marked, ' + rows.length + ' rows on the page')
  }
}

async function readable (ipc, page, selector, what) {
  const found = await ipc.call('read', { selector }).catch(() => null)
  if (!found) return

  const items = found.count > 1 ? found.items : [found]
  //TEXT THAT IS ACTUALLY THERE. A `.placeholder-glow` paragraph is a skeleton
  //with no words in it, and the contrast of nothing against anything is not a
  //fact about whether this app can be read.
  const measured = items.filter(item =>
    item.contrast && item.visible && String(item.text || '').trim())
  if (!measured.length) return

  const worst = measured.reduce((low, item) => item.contrast.ratio < low.contrast.ratio ? item : low)

  check(page + ': ' + what + ' are readable',
    worst.contrast.ratio >= READABLE,
    worst.contrast.ratio + ':1 on ' + worst.element + ' "' + worst.text.slice(0, 30) + '"')
}

async function finish (wasRunning, ipc, restoreOpen) {
  if (restoreOpen) {
    // PUT THE MACHINE BACK THE WAY IT WAS FOUND. By pid, because `quit` is not
    // on a closed build's open list and would be refused.
    note('\nshutting the closed build down and starting the open one again')
    stopIt()
    delete process.env.APP_OPEN
    shared.start(passthrough)
  } else if (!wasRunning) {
    note('\nshutting it down again')

    // `quit` FIRST, BECAUSE A PACKAGE WRITES NO .nw-instance.json and
    // tools/stop.js has nothing to find. It is on the shipped open list for
    // exactly this reason -- see src/config.js. stopIt() is the fallback for a
    // build old enough, or shut hard enough, to refuse it.
    await ipc.call('quit', {}).catch(() => {})
    if (await ipc.running().catch(() => false)) stopIt()
  } else {
    note('\nleaving it running, since it was')
  }

  console.log('')
  const alsoSkipped = skipped.length ? ', ' + skipped.length + ' skipped' : ''

  if (failures.length) {
    console.log(failures.length + ' failed, ' + passed + ' passed' + alsoSkipped)
    failures.forEach(f => console.log('  x ' + f))
    process.exit(1)
  }

  console.log(passed + ' checks passed' + alsoSkipped)
  //SAID AGAIN AT THE END, because a skip scrolls past in the middle of a run
  //and "119 checks passed" would otherwise be read as "everything was checked"
  skipped.forEach(one => console.log('  - ' + one))
  process.exit(0)
}

main().catch(err => {
  console.error('\n' + (err && err.stack || err))
  process.exit(1)
})
