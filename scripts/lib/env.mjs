// Shared helpers for the setup/dev/test scripts.
// Deliberately zero npm dependencies: these scripts must run immediately after
// `git clone`, before anything has been installed.

import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const BACKEND = join(ROOT, 'backend')
export const FRONTEND = join(ROOT, 'frontend')
export const IS_WINDOWS = process.platform === 'win32'

// ---------------------------------------------------------------- output ----
const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', gray: '\x1b[90m', bold: '\x1b[1m',
}
export const ok = (m) => console.log(`${C.green}✓${C.reset} ${m}`)
export const warn = (m) => console.log(`${C.yellow}!${C.reset} ${m}`)
export const fail = (m) => console.log(`${C.red}✗${C.reset} ${m}`)
export const info = (m) => console.log(`${C.blue}→${C.reset} ${m}`)
export const dim = (m) => console.log(`${C.gray}${m}${C.reset}`)
export const title = (m) => console.log(`\n${C.bold}${m}${C.reset}`)

// ------------------------------------------------------------- processes ----
// We never pass shell:true. Node concatenates the args array into a single
// unquoted command line in that mode, so any argument containing a space is
// silently re-split by the shell — which is what made `-e "SELECT 1"` arrive at
// mysql as a query plus a database name. Node 24 also emits DEP0190 warning
// about exactly this hazard.
//
// The only reason shell:true was tempting is that npm on Windows is npm.cmd,
// which CreateProcess cannot launch directly. Naming the shim explicitly solves
// that without giving up argument safety. Real executables (python.exe,
// mysql.exe) are found by libuv through PATH/PATHEXT.
// npm/npx on Windows are .cmd batch files, not executables. Since the fix for
// CVE-2024-27980, Node REFUSES to spawn a .cmd without a shell — which is why
// naming the shim `npm.cmd` with shell:false reported "npm not found".
//
// So those specific commands do need a shell. We keep them safe by building the
// command line ourselves, quoting every argument, and passing it as a single
// string with no args array (which also avoids Node 24's DEP0190 warning).
// Everything else — python.exe, mysql.exe — stays on the safe shell-free path.
const WINDOWS_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm'])

const needsShell = (cmd) => IS_WINDOWS && WINDOWS_SHIMS.has(cmd)

function quoteArg(a) {
  const s = String(a)
  return /[\s&|<>^"()]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const commandLine = (cmd, args) => [cmd, ...args.map(quoteArg)].join(' ')

export function run(cmd, args, opts = {}) {
  if (needsShell(cmd)) {
    return spawnSync(commandLine(cmd, args), { stdio: 'inherit', shell: true, ...opts })
  }
  return spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts })
}

export function capture(cmd, args, opts = {}) {
  const r = needsShell(cmd)
    ? spawnSync(commandLine(cmd, args), { encoding: 'utf8', shell: true, ...opts })
    : spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts })
  if (r.error || r.status !== 0) return null
  return `${r.stdout || ''}${r.stderr || ''}`.trim()
}

export function spawnLive(cmd, args, opts = {}) {
  if (needsShell(cmd)) {
    return spawn(commandLine(cmd, args), { shell: true, ...opts })
  }
  return spawn(cmd, args, { shell: false, ...opts })
}

// Reports whether a TCP port is already accepting connections, so we can fail
// with an explanation instead of a stack trace from deep inside Vite.
export async function portInUse(port) {
  const net = await import('node:net')
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    const done = (v) => { socket.destroy(); resolve(v) }
    socket.setTimeout(700)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

// ------------------------------------------------------------ interpreter ----
// Windows ships `python`; most Linux/macOS setups only expose `python3`.
export function findPython() {
  for (const c of IS_WINDOWS ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    const v = capture(c, ['--version'])
    if (v && /Python 3\.(\d+)/.test(v)) {
      const minor = Number(v.match(/Python 3\.(\d+)/)[1])
      if (minor >= 9) return { cmd: c, version: v.replace(/^Python\s*/, '') }
    }
  }
  return null
}

export const VENV = join(BACKEND, 'venv')
export const venvPython = () =>
  IS_WINDOWS ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python')
export const venvReady = () => existsSync(venvPython())

// --------------------------------------------------------------- dotenv -----
// Minimal .env reader — we only need it to locate the database.
export function readEnv(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    let v = t.slice(i + 1).trim()
    // Strip surrounding quotes. python-dotenv (which the Flask app uses) does
    // this, so if we didn't, a quoted password would work for Flask but fail
    // here — the two halves of the project would disagree about the value.
    if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, i).trim()] = v
  }
  return out
}

// MySQL's Windows client reads the console code page and aborts on ones it does
// not recognise — e.g. cp862 on a Hebrew Windows install. Forcing the charset
// skips that detection entirely.
export const MYSQL_CHARSET_ARG = '--default-character-set=utf8mb4'

/**
 * Runs the mysql client.
 *
 * CRITICAL: this must NOT go through a shell. With shell:true the args array is
 * flattened into one unquoted command line, so `-e` `SELECT 1` becomes
 * `-e SELECT 1` — the shell then re-splits it and mysql reads "1" as the
 * DATABASE NAME. The symptom is a baffling "Unknown database '1'" or
 * "Access denied ... to database '1'" that looks like a credentials problem.
 *
 * Passing shell:false hands the args to the process verbatim, spaces included.
 * On Windows libuv still resolves `mysql` to `mysql.exe` via PATH/PATHEXT; on
 * the rare setup where it does not, we fall back to a shell with real quoting.
 */
export function runMysql(args, { password, input } = {}) {
  const env = { ...process.env }
  if (password) env.MYSQL_PWD = password
  else delete env.MYSQL_PWD

  const full = [MYSQL_CHARSET_ARG, ...args]
  const opts = { encoding: 'utf8', env, shell: false }
  if (input !== undefined) opts.input = input

  const r = spawnSync('mysql', full, opts)

  if (r.error && r.error.code === 'ENOENT' && IS_WINDOWS) {
    const quoted = full.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    return spawnSync('mysql', quoted, { ...opts, shell: true })
  }
  return r
}

// Runs backend/tools/db_probe.py, which tests the connection through the same
// client the Flask app uses. The CLI and mysql-connector-python are different
// clients with different defaults; only this tells us what the app will see.
export function runDbProbe({ inherit = true } = {}) {
  const probe = join(BACKEND, 'tools', 'db_probe.py')
  if (!existsSync(probe) || !venvReady()) return null
  return spawnSync(venvPython(), [probe], {
    cwd: BACKEND,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    shell: false,
  })
}

// mysql prints warnings before the real failure, so the first line of stderr is
// usually noise. Prefer the line that actually says ERROR.
export function meaningfulMysqlError(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.find((l) => /^ERROR\b|access denied|can't connect/i.test(l)) || lines[0] || ''
}
