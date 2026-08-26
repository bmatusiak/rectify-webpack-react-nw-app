'use strict'

// Close the app, wait until it is actually gone, and start it again.
//
//   npm run restart              the source tree
//   npm run restart -- --build   whatever ./build.js left in build/app
//   npm run restart -- --serve   and let a browser be a client
//
// EVERY FLAG AFTER THE SCRIPT NAME GOES TO ./nw.js UNTOUCHED, so this is the
// same launcher with a stop in front of it rather than a second way to start.
//
// WHY IT IS A SCRIPT AND NOT `stop && start`. The stop has to have FINISHED, and
// a shell chaining two commands only knows that the first process exited -- not
// that the app it asked to close has released the control socket, the instance
// file and webpack's watchers. ./stop.js waits for the pid to actually go, which
// is the whole reason it exists, and this is what makes that waiting worth
// having.
//
// WHAT IT IS FOR. Three files in this scaffold are read once at boot and cannot
// hot reload: src/main.js, webpack.config.js and package.json -- plus every
// `main.test.js`, which is loaded off disk by that same boot. Editing any of
// them and carrying on gives the WRONG error, because core/build keeps rebuilding
// with the config it loaded at startup. This is the answer to that, in one word
// instead of four commands and a wait somebody has to guess the length of.

const { spawnSync, spawn } = require('node:child_process')
const path = require('node:path')

const HERE = __dirname
const APP = path.join(HERE, '..')

const args = process.argv.slice(2)

//STOPPED FIRST, AND ONLY THEN. A non-zero exit means the app is still holding
//everything, so starting now would launch a second copy into a port and a socket
//the first one still owns -- and nw.js hands a second launch to the running
//instance, so what looks like a restart would be the OLD app coming to the
//front. Nothing about that says "your change is not in".
const stopped = spawnSync(process.execPath, [path.join(HERE, 'stop.js')], {
  stdio: 'inherit',
  cwd: APP
})

if (stopped.status !== 0) {
  console.error('not starting: the app is still running')
  process.exit(1)
}

console.log('')

//INHERITED, NOT CAPTURED. ./nw.js puts the app in the foreground and its output
//on the screen on purpose -- a restart that swallowed the log would be a restart
//nobody could debug.
const started = spawn(process.execPath, [path.join(HERE, 'nw.js')].concat(args), {
  stdio: 'inherit',
  cwd: APP
})

started.on('exit', function (code) { process.exit(code === null ? 1 : code) })
