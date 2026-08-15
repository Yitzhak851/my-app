#!/usr/bin/env node
/**
 * Isolates a MySQL connection problem instead of guessing at it.
 *
 *   npm run db:doctor
 *   npm run db:doctor -- --password "the password you type at the mysql prompt"
 *
 * The --password form is the decisive test: it bypasses backend/.env entirely,
 * so if it succeeds while the .env value fails, the problem is the file, not
 * the server or the credentials.
 *
 * Nothing is written and no password is ever printed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BACKEND, IS_WINDOWS, readEnv, capture,
  ok, warn, fail, info, dim, title, runMysql, meaningfulMysqlError,
} from './lib/env.mjs'

const argv = process.argv.slice(2)
const pwIndex = argv.indexOf('--password')
const OVERRIDE_PW = pwIndex !== -1 ? argv[pwIndex + 1] : null

// ───────────────────────────────────────────────────── 1. the client ────────
title('1  MySQL client')
const version = capture('mysql', ['--version'])
if (!version) {
  fail('the `mysql` command is not on your PATH')
  dim('    Add MySQL\'s bin folder to PATH, or use:  docker compose up')
  process.exit(1)
}
ok(version)

// ───────────────────────────────────────────────── 2. what .env says ────────
title('2  What backend/.env actually contains')
const envPath = join(BACKEND, '.env')
if (!existsSync(envPath)) {
  fail('backend/.env does not exist — run: npm run setup')
  process.exit(1)
}

const env = readEnv(envPath)
const host = env.DB_HOST || 'localhost'
const user = env.DB_USER || 'root'
const name = env.DB_NAME || 'social_app'
const filePw = env.DB_PASSWORD ?? ''

console.log(`    DB_HOST = ${host}`)
console.log(`    DB_USER = ${user}`)
console.log(`    DB_NAME = ${name}`)

// Describe the password without ever printing it — its shape is usually the bug.
const rawLine = readFileSync(envPath, 'utf8')
  .split(/\r?\n/).find((l) => l.trim().startsWith('DB_PASSWORD='))
const rawValue = rawLine ? rawLine.slice(rawLine.indexOf('=') + 1) : ''

if (!filePw) {
  warn('DB_PASSWORD is EMPTY')
  dim('    If your MySQL root account has a password, this is the problem.')
} else {
  ok(`DB_PASSWORD is set (${filePw.length} characters)`)
  if (/^["']|["']$/.test(rawValue.trim())) {
    dim('    Note: the value is quoted in the file. Quotes are stripped before use.')
  }
  if (rawValue !== rawValue.trimEnd()) {
    warn('    The line has trailing whitespace — it is trimmed, but check it is intentional.')
  }
  if (/[#]/.test(filePw)) {
    dim('    The password contains "#". That is fine here, but wrap it in quotes to be safe.')
  }
}

// ─────────────────────────────────────────────────── 3. connection tests ────
title('3  Connection tests')

function attempt(label, password, extraArgs = []) {
  const r = runMysql(['-h', host, '-u', user, ...extraArgs, '-e', 'SELECT 1'], { password })
  const good = r.status === 0
  const err = meaningfulMysqlError(`${r.stderr || ''}\n${r.stdout || ''}`)
  if (good) ok(`${label}: SUCCESS`)
  else { fail(`${label}: failed`); if (err) dim(`      ${err}`) }
  return { good, err }
}

const withFile = attempt('using DB_PASSWORD from backend/.env', filePw)
const withNone = filePw ? attempt('using no password at all', '') : { good: false, err: '' }
const withArg = OVERRIDE_PW !== null
  ? attempt('using the --password you supplied', OVERRIDE_PW)
  : null

// ──────────────────────────────────────────────────────── 4. verdict ────────
title('4  Verdict')

if (withFile.good) {
  ok('backend/.env is correct. The database step should now succeed.')
  const dbCheck = runMysql(['-h', host, '-u', user, '-e', `USE \`${name}\`; SHOW TABLES;`], { password: filePw })
  if (dbCheck.status === 0) {
    const tables = (dbCheck.stdout || '').split(/\r?\n/).filter((l) => l && !/^Tables_in/.test(l))
    if (tables.length) ok(`database "${name}" exists with tables: ${tables.join(', ')}`)
    else warn(`database "${name}" exists but has no tables — run: npm run db:init`)
  } else {
    warn(`database "${name}" does not exist yet — run: npm run db:init`)
  }
  info('Next:  npm start')
  process.exit(0)
}

if (withNone.good) {
  fail('Your MySQL account has NO password, but backend/.env sets one.')
  dim('    Fix: make the DB_PASSWORD line empty:')
  dim('        DB_PASSWORD=')
  process.exit(1)
}

if (withArg?.good) {
  fail('The password you passed on the command line WORKS, but the one in')
  fail('backend/.env does not. The file is the problem, not MySQL.')
  dim('')
  dim('    Most likely causes:')
  dim('      • the file was saved with a different value than you think')
  dim('      • an invisible character was pasted in')
  dim('      • the file is not saved as UTF-8')
  dim('')
  dim('    Rewrite the line from a terminal so nothing can be mistyped:')
  dim(`        node -e "require('fs').appendFileSync('backend/.env','\\nDB_PASSWORD=YOUR_PASSWORD\\n')"`)
  dim('    then delete the old DB_PASSWORD line.')
  process.exit(1)
}

const err = withFile.err || ''
if (/access denied/i.test(err)) {
  fail(`MySQL rejected user "${user}".`)
  dim('')
  dim('    Confirm the password by hand. In Git Bash the prompt needs winpty:')
  dim(`        winpty mysql -u ${user} -p`)
  dim('    or open plain CMD (not Git Bash) and run:')
  dim(`        mysql -u ${user} -p`)
  dim('')
  dim('    Once you know the working password, verify it here without editing files:')
  dim('        npm run db:doctor -- --password "that password"')
} else if (/can't connect|connection refused|2003|2002/i.test(err)) {
  fail('The MySQL server is not reachable.')
  dim(IS_WINDOWS ? '    Start it:  net start MySQL93   (name may differ — check services.msc)'
                 : '    Start it:  sudo service mysql start')
} else {
  fail('Unrecognised MySQL error — see the output above.')
}
dim('')
dim('    Always available as a fallback:   docker compose up')
process.exit(1)
