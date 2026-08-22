// Read the documentation back off the code.
//
//   npm run docs
//
// `test/readme.test.js` checks that a plugin HAS a README and that its table
// lists the right contexts with the right provides/consumes. It cannot check a
// sentence, so everything a README says in prose is unchecked -- and prose is
// what goes stale, because two places said one fact and only one of them was
// edited. Six of those were found by hand in one afternoon: a protocol
// described as packaged-only that every build now uses, a frame described as
// sandboxed that has no sandbox attribute, a tray checkbox that nw never drew.
//
// So these are the checks that found them, written down. This is NOT part of
// `npm test`: three of the five are heuristics, and a heuristic that goes red
// on a Friday teaches people to ignore red. Run it when the docs matter --
// after a sweep, before a release, when a README has been sitting a while.
//
// It exits non-zero when it finds something, so it can be wired into a suite
// the day somebody decides the heuristics have earned it.

const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const APP = path.join(ROOT, 'src', 'app')
const CONTEXTS = ['main', 'server', 'window', 'cli']

const findings = []
function report (where, what) { findings.push({ where, what }) }

// every plugin README, and the folder it belongs to
function readmes (dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (entry.name === 'vendor' || entry.name === 'node_modules') return
    const here = path.join(dir, entry.name)
    if (entry.isDirectory()) readmes(here, out)
    else if (entry.name === 'README.md') out.push(path.dirname(here))
  })
  return out
}

function read (file) { return fs.readFileSync(file, 'utf8') }
function relative (dir) { return path.relative(APP, dir).split(path.sep).join('/') }

function contextFiles (dir) {
  return fs.readdirSync(dir)
    .filter(f => CONTEXTS.some(c => f === c + '.js'))
    .map(f => path.join(dir, f))
}

// CODE, WITH THE PROSE TAKEN OUT -- comments AND string literals.
//
// A name that appears only in a sentence is not a name the app has, and this
// app writes a great many sentences. `window.capture().photograph()` was
// invented to test check 2 and went unreported twice: first because
// window/main.js has a comment about a minimized window having no frame to
// photograph, and then because window/main.test.js asserts with the message
// 'it tried to photograph a minimized window'.
//
// The cost is a name reached only as `obj['name']`, which this would call
// missing. There are none here, and a false alarm on one is cheaper than the
// silence that hid two sabotages.
function stripProse (src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

function sources (dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => stripProse(read(path.join(dir, f))))
    .join('\n')
}

// THE SURFACE IS THE UNTAGGED FENCE. A README here lists what the plugin hands
// out in a bare ``` block and writes its examples in ```js -- so the untagged
// one is the surface and the tagged ones are illustrations, which name things
// that are deliberately made up. Taking "the first fence" instead reported
// `prefs.density` from core/storage, whose first fence is an example.
function surfaceBlock (text) {
  const fence = text.match(/```[\r\n][\s\S]*?```/)
  return fence ? fence[0] : ''
}

//---- 1. what a plugin registers, and the README never mentions ---------------
//
// The one that found `bridge.detach`: on the surface, in no README, and the
// export where silence is worst -- a reader who finds attach() without it will
// assume attaching twice is safe.
function registeredButUndocumented (dir) {
  const text = read(path.join(dir, 'README.md'))
  const missing = []

  contextFiles(dir).forEach(file => {
    const src = read(file)
    let at = src.indexOf('register(null, {')

    while (at >= 0) {
      const block = src.slice(at, at + 1500)
      const keys = block.match(/^\s{8,12}([A-Za-z_$][\w$]*)\s*:/gm) || []

      keys.forEach(line => {
        const key = line.trim().replace(':', '')
        if (key === 'onDestroy') return
        if (text.includes(key)) return
        if (!missing.includes(key)) missing.push(key)
      })

      at = src.indexOf('register(null, {', at + 1)
    }
  })

  if (missing.length) report(relative(dir), 'registers but never documents: ' + missing.join(', '))
}

//---- 2. what a README advertises, and the source does not have ---------------
// EXISTENCE IS A QUESTION ABOUT THE APP, NOT THE FOLDER. appPackage documents
// .description, .author and .license, and picks them in src/main.js -- looking
// only beside the README called all three of them missing.
function documentedButAbsent (dir, everything) {
  const block = surfaceBlock(read(path.join(dir, 'README.md')))
  const src = sources(dir) + everything
  const gone = []

  ;(block.match(/\.([A-Za-z_$][\w$]*)\s*(?=[(\s])/g) || []).forEach(match => {
    const name = match.slice(1).trim()
    if (name.length <= 2 || src.includes(name) || gone.includes(name)) return
    gone.push(name)
  })

  if (gone.length) report(relative(dir), 'documents but the source lacks: ' + gone.join(', '))
}

//---- 3. files and flags a README names, that nothing has --------------------
//
// A renamed file leaves every mention of the old name reading perfectly.
// AND THIS ONE READS THE COMMENTS. Check 2 asks whether a name EXISTS, which
// only code can answer; this asks whether a file is ever referred to, and a
// filename lives in a comment as legitimately as in a require. Handing it the
// stripped copy made it report `_generated_background_page.html`, which is a
// page nw makes and this app names.
function namesThatAreGone (dir, everything, tracked) {
  const text = read(path.join(dir, 'README.md'))
  const gone = []

  ;(text.match(/`[^`\n]+`/g) || []).forEach(token => {
    const name = token.slice(1, -1).trim()
    const looksLikeFile = /^[\w./-]+\.(js|mjs|json|scss|css|html|bin)$/.test(name)
    //`--bs-emphasis-color` is a css custom property, not a flag anybody passes
    const looksLikeFlag = /^--[\w-]+$/.test(name) && !name.startsWith('--bs-')
    if (!looksLikeFile && !looksLikeFlag) return

    const base = name.split('/').pop()
    if (tracked.includes(base) || everything.includes(name) || everything.includes(base)) return
    if (!gone.includes(name)) gone.push(name)
  })

  if (gone.length) report(relative(dir), 'names something nothing has: ' + gone.join(', '))
}

//---- 4. a table of tests, against the tests --------------------------------
//
// Several READMEs carry `| test | what breaking it looks like |`. A renamed
// test leaves the row describing something that no longer runs.
function testTables (dir) {
  const text = read(path.join(dir, 'README.md'))
  if (!/\|\s*test\s*\|/i.test(text)) return

  const names = []
  fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).forEach(f => {
    const src = read(path.join(dir, f))
    ;(src.match(/\bit\((["'])(.+?)\1/g) || []).forEach(m => names.push(m.slice(4, -1)))
  })
  if (!names.length) return

  // rows after the `| test |` header, first cell only
  const rows = (text.match(/^\|\s*[a-z][^|]{10,}\|/gm) || [])
    .map(line => line.replace(/^\|/, '').split('|')[0].trim())
    .filter(cell => cell.toLowerCase() !== 'test')

  const orphans = rows.filter(row => {
    const head = row.slice(0, 26)
    return !names.some(name => name.includes(head) || row.includes(name.slice(0, 26)))
  })

  // a README with a test table also has other tables; only complain when the
  // MAJORITY of rows match nothing, which is what a rename looks like
  if (orphans.length && orphans.length < rows.length) return
  if (orphans.length) report(relative(dir), 'test table names nothing that runs: ' + orphans.join(' / '))
}

//---- 5. counted claims -----------------------------------------------------
//
// Numbers written into prose, measured against the thing they count. Not a
// heuristic: each one names what it counts and how.
function counted () {
  const swatches = fs.readdirSync(path.join(APP, 'ui/theme/swatch'), { withFileTypes: true })
    .filter(e => e.isDirectory()).length + 1 // plus stock bootstrap

  // IT READS WHATEVER NUMBER THE PROSE SAYS, rather than looking for the number
  // that is currently right. The first version knew the words "28 swatches" and
  // was silent when a README was edited to say 31 -- it could only catch the
  // count changing, never the sentence changing.
  const WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, twelve: 12, sixteen: 16, twenty: 20, 'twenty-four': 24,
    'twenty-six': 26, 'twenty-eight': 28, thirty: 30
  }

  // ONLY THE NOUNS THAT ARE ALWAYS A TOTAL.
  //
  // "pages" and "contexts" were here and had to go: this app writes sentences
  // like "inline code at 1.49:1 on four pages" and "those three contexts are
  // reported as skipped", which count a subset and are perfectly true. Three
  // false alarms out of four findings is how a check gets ignored, and an
  // ignored check is worse than no check -- it looks like coverage.
  //
  // A swatch count is different: nothing here says "four swatches" about a
  // handful of them, because a swatch is only ever discussed as a set.
  const facts = [
    { count: swatches, of: 'swatches', is: 'swatch folders plus default' }
  ]

  cp.execSync('git ls-files "*.md"', { cwd: ROOT }).toString().split(/\r?\n/).filter(Boolean)
    .forEach(file => {
      const text = read(path.join(ROOT, file))

      facts.forEach(fact => {
        const said = new RegExp('([\\w-]+)\\s+(?:of the\\s+)?' + fact.of + '\\b', 'gi')
        let hit

        while ((hit = said.exec(text))) {
          const word = hit[1].toLowerCase()
          const number = /^\d+$/.test(word) ? Number(word) : WORDS[word]
          if (number === undefined || number === fact.count) continue

          report(file, 'says "' + hit[0].trim() + '" and there are ' +
            fact.count + ' (' + fact.is + ')')
        }
      })
    })
}

function main () {
  const folders = readmes(APP, [])

  const tracked = cp.execSync('git ls-files', { cwd: ROOT }).toString()
    .split('\n').map(f => f.split('/').pop())

  // TWO HAYSTACKS, because the two questions are different. `code` is what the
  // app can do; `everything` is what the app mentions. Asking check 3 about the
  // first made it report a page nw makes and this app only names in a comment.
  let code = ''
  let everything = ''

  cp.execSync('git ls-files src tools test', { cwd: ROOT }).toString().split(/\r?\n/).filter(Boolean)
    .forEach(file => {
      if (!/\.(js|mjs|json|scss|html)$/.test(file)) return
      const text = read(path.join(ROOT, file))
      everything += text
      //scss carries the same two comment forms, and this app writes as much
      //prose in index.scss as in any plugin -- the word that hid a sabotage the
      //third time was in a comment there
      code += /\.(js|mjs|scss)$/.test(file) ? stripProse(text) : text
    })

  folders.forEach(dir => {
    registeredButUndocumented(dir)
    documentedButAbsent(dir, code)
    namesThatAreGone(dir, everything, tracked)
    testTables(dir)
  })
  counted()

  console.log(folders.length + ' plugin READMEs, read back off the code')

  if (!findings.length) {
    console.log('nothing to say')
    return process.exit(0)
  }

  console.log('')
  findings.forEach(f => console.log('  x ' + f.where + '  ' + f.what))
  console.log('\n' + findings.length + (findings.length === 1 ? ' finding' : ' findings'))
  console.log('each one is a heuristic -- read it before believing it')
  process.exit(1)
}

main()
