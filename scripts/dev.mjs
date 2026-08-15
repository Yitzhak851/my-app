#!/usr/bin/env node
/**
 * Runs the Flask backend and the Vite frontend together in one terminal,
 * with prefixed output and a single Ctrl+C that stops both.
 *
 * Implemented with node:child_process rather than `concurrently` so the root
 * project has zero npm dependencies — `git clone` followed by this script
 * cannot fail on a dependency install that hasn't happened yet.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  ROOT, BACKEND, FRONTEND, IS_WINDOWS, venvPython, venvReady,
  readEnv, spawnLive, portInUse, fail, warn, dim,
} from './lib/env.mjs'

if (!venvReady()) {
  fail('Backend virtualenv missing. Run:  npm run setup')
  process.exit(1)
}
if (!existsSync(join(FRONTEND, 'node_modules'))) {
  fail('Frontend dependencies missing. Run:  npm run setup')
  process.exit(1)
}

const backendEnv = readEnv(join(BACKEND, '.env'))
const BACKEND_PORT = backendEnv.PORT || '5000'
const FRONTEND_PORT = '5173'

// Check the ports before starting anything. Vite uses strictPort, so a busy
// 5173 kills the whole run — better to say so plainly than to surface a stack
// trace from inside Vite after the backend has already started.
const busy = []
for (const [port, who] of [[Number(BACKEND_PORT), 'backend'], [Number(FRONTEND_PORT), 'frontend']]) {
  if (await portInUse(port)) busy.push({ port, who })
}
if (busy.length) {
  for (const b of busy) fail(`port ${b.port} (${b.who}) is already in use`)
  warn('Another copy of this app is probably still running.')
  dim('')
  dim('  Close the other terminal, or free the ports:')
  if (IS_WINDOWS) {
    for (const b of busy) {
      dim(`      netstat -ano | findstr :${b.port}`)
      dim('      taskkill /PID <PID> /F')
    }
  } else {
    dim(`      lsof -ti:${busy.map((b) => b.port).join(',')} | xargs kill -9`)
  }
  dim('')
  dim('  Already have it running? Just open http://localhost:' + FRONTEND_PORT)
  process.exit(1)
}

const COLORS = { backend: '\x1b[36m', frontend: '\x1b[35m', reset: '\x1b[0m' }

const children = []
let shuttingDown = false

// Vite prints the URL it actually bound to. We trust that over our own guess,
// so the browser can never be opened on a port nothing is listening to.
let detectedFrontendUrl = null

function start(name, cmd, args, cwd) {
  const child = spawnLive(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = `${COLORS[name]}[${name}]${COLORS.reset}`

  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      if (!line.trim()) return
      if (name === 'frontend' && !detectedFrontendUrl) {
        const m = line.match(/Local:\s+(https?:\/\/\S+?)\/?\s*$/)
        if (m) detectedFrontendUrl = m[1].replace(/\x1b\[[0-9;]*m/g, '')
      }
      console.log(`${tag} ${line}`)
    })
  }

  child.on('exit', (code) => {
    if (shuttingDown) return
    console.log(`${tag} exited with code ${code}`)
    shutdown(code ?? 1)
  })

  children.push(child)
  return child
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  console.log('\nStopping both servers ...')
  for (const c of children) {
    if (c.exitCode !== null) continue
    // On Windows a plain kill() does not reach the whole process tree.
    if (IS_WINDOWS) spawnLive('taskkill', ['/pid', String(c.pid), '/f', '/t'], { stdio: 'ignore' })
    else c.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 400)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log(`
  Starting both servers. Press Ctrl+C to stop.
`)

start('backend', venvPython(), ['run.py'], BACKEND)
start('frontend', 'npm', ['run', 'dev'], FRONTEND)

// Opens the default browser on every platform. Each OS has its own opener and
// none of them exist on the others, so this is a straight three-way branch.
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // The first "" is the window title, which `start` otherwise steals from the URL.
      spawnLive('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
    } else if (process.platform === 'darwin') {
      spawnLive('open', [url], { stdio: 'ignore', detached: true }).unref()
    } else {
      spawnLive('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
    }
  } catch {
    // Never fatal — the URL is printed anyway.
  }
}

const NO_OPEN = process.argv.includes('--no-open') || process.env.NO_OPEN === '1'

setTimeout(() => {
  if (shuttingDown) return
  const FRONTEND_URL = detectedFrontendUrl || `http://localhost:${FRONTEND_PORT}`
  console.log(`
  ${COLORS.backend}Backend ${COLORS.reset} http://localhost:${BACKEND_PORT}
  ${COLORS.frontend}Frontend${COLORS.reset} ${FRONTEND_URL}
`)
  if (NO_OPEN) {
    dim(`  Open ${FRONTEND_URL} in your browser.`)
  } else {
    dim('  Opening your browser ...')
    openBrowser(FRONTEND_URL)
  }
}, 3000)
