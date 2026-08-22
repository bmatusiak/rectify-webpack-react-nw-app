// An MCP server for this app, spoken on stdin and stdout.
//
//   claude mcp add rectify-nw -- node /path/to/tools/mcp.js
//
// The client launches this; it connects to the app that is already running and
// forwards what it is asked. Nothing here decides what the app can do -- that
// is src/app_plugins/mcp, which holds the tools, resources and prompts a plugin
// registered, and this turns them into JSON-RPC.
//
// WHY A BRIDGE RATHER THAN A SERVER INSIDE THE APP. The app can serve http, and
// it goes to some trouble not to: the port is off unless asked for, the tray can
// stop it, and `"canServe": false` removes the routes and socket.io from the
// binary at build time. An MCP server listening inside the app would undo all of
// that for everyone who never uses it. This opens nothing. It talks over the
// control socket -- a named pipe on windows, a unix socket elsewhere -- which is
// the same one `node src/cli.js` uses, so it adds no surface that was not
// already there.
//
// AND IT IS NOT A SECURITY BOUNDARY, which is worth saying plainly. Anything
// that can run this can already run the cli. What it is, is a stable, described,
// schema'd subset of the app aimed at a model, instead of fourteen commands
// aimed at a person -- `quit` is deliberately not among them.

const os = require('node:os')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))

// THE VERSIONS THIS SPEAKS, newest first. A client asks for one; if it is on
// this list it gets it back, and if it is not it gets the newest here and
// decides for itself whether to carry on -- which is what the spec asks for
// rather than refusing outright.
const SPOKEN = ['2025-06-18', '2025-03-26', '2024-11-05']

const JSONRPC = '2.0'
const NEWLINE = String.fromCharCode(10)

//---- the app, over the socket it already listens on -------------------------
//
// This is src/app/core/ipc/endpoint.js's answer, worked out the same way rather
// than imported: this file is plain node run from anywhere, and reaching into
// src/ for a path helper would make the bridge depend on the bundle it is
// deliberately outside of.
function endpoint () {
  if (process.platform !== 'win32') return path.join(os.tmpdir(), pkg.name + '.sock')

  // built from char codes for the reason endpoint.js gives: a literal is four
  // backslashes deep and every layer between here and the pipe has an opinion
  const slash = String.fromCharCode(92)
  return slash + slash + '.' + slash + 'pipe' + slash + pkg.name
}

// THE SOCKET IS NOT THE PERMISSION. The app writes a secret beside it and
// refuses commands from a connection that cannot repeat it -- a named pipe's
// default acl is not restrictive and /tmp is world-readable, so being hard to
// find is not the same as being hard to reach. The cli says it once per
// connection; so does this. Without it every call comes back "not
// authenticated", which is a confusing way to learn about a step you skipped.
function token () {
  try { return fs.readFileSync(path.join(os.tmpdir(), pkg.name + '.token'), 'utf8').trim() }
  catch (e) { return null }
}

let seq = 0
const waiting = new Map()
let socket = null
let held = ''

function connect () {
  return new Promise((resolve, reject) => {
    const client = net.connect(endpoint())

    client.on('connect', () => {
      socket = client
      client.write(JSON.stringify({ command: 'auth', data: { token: token() } }) + NEWLINE)
      resolve(client)
    })

    client.on('error', e => {
      // THE ONE FAILURE WORTH A GOOD SENTENCE. A client that launched this and
      // got ECONNREFUSED needs to know the protocol is fine and the app is not
      // running, or it will report an MCP problem to somebody who has an app
      // problem.
      reject(new Error(e.code === 'ENOENT' || e.code === 'ECONNREFUSED'
        ? 'the app is not running -- start it with `npm start` in ' + ROOT
        : 'could not reach the app: ' + e.message))
    })

    client.on('data', chunk => {
      held += chunk.toString()
      const lines = held.split(/\r?\n/)
      held = lines.pop()

      lines.forEach(line => {
        if (!line.trim()) return
        let answer
        try { answer = JSON.parse(line) } catch (e) { return }

        const settle = waiting.get(answer.id)
        if (!settle) return
        waiting.delete(answer.id)

        if (answer.error) settle.reject(new Error(answer.error))
        else settle.resolve(answer.result)
      })
    })

    // the app going away mid-question is not silence: everything outstanding is
    // told, or the client waits for an answer that cannot arrive
    client.on('close', () => {
      socket = null
      waiting.forEach(settle => settle.reject(new Error('the app closed the connection')))
      waiting.clear()
    })
  })
}

async function ask (command, data) {
  if (!socket) await connect()

  const id = ++seq
  socket.write(JSON.stringify({ command, data: data || {}, id }) + NEWLINE)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error(command + ' did not answer within 30s'))
    }, 30000)

    waiting.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value) },
      reject: error => { clearTimeout(timer); reject(error) }
    })
  })
}

//---- JSON-RPC, on stdin and stdout ------------------------------------------
//
//THE PROTOCOL ITSELF IS NOT HERE EITHER. src/app_plugins/mcp/rpc.js answers the
//methods, and it is shared with the http transport beside it -- two files
//speaking one protocol drifted about an hour after the second was written. This
//file is a socket, a line splitter, and stdout.
const rpc = require(path.join(ROOT, 'src', 'app_plugins', 'mcp', 'rpc.js'))(ask)

function send (message) { process.stdout.write(JSON.stringify(message) + NEWLINE) }

async function arrived (line) {
  let message
  try {
    message = JSON.parse(line)
  } catch (e) {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }

  const answer = await rpc.handle(message)
  if (answer) send(answer)
}

function main () {
  let buffer = ''

  process.stdin.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop()
    lines.forEach(line => { if (line.trim()) arrived(line) })
  })

  // the client closing stdin is how a stdio server is told to stop
  process.stdin.on('end', () => process.exit(0))

  // NOTHING GOES TO STDOUT THAT IS NOT A MESSAGE. A stray console.log lands in
  // the middle of the protocol and the client sees a parse error rather than
  // whatever was being reported, so anything this file wants to say goes to
  // stderr, which the client shows as server logs.
  process.on('uncaughtException', e => {
    process.stderr.write('mcp bridge: ' + ((e && e.stack) || e) + NEWLINE)
  })
}

main()
