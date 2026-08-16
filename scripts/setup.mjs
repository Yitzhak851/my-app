#!/usr/bin/env node
/**
 * One-command setup. Safe to re-run: every step is idempotent and nothing is
 * overwritten without --force.
 *
 *   node scripts/setup.mjs                (full setup)
 *   node scripts/setup.mjs --check-only   (prerequisites only, changes nothing)
 *   node scripts/setup.mjs --db-only      (database only)
 *   node scripts/setup.mjs --db-only --force   (DROP and recreate the database)
 *
 * Design rule: system software (Node, Python, MySQL) is CHECKED, never installed.
 * Silently installing a database server is not portable and not our call to make.
 */
import { existsSync, copyFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ROOT, BACKEND, FRONTEND, IS_WINDOWS, VENV, venvPython, venvReady,
  findPython, capture, run, readEnv, ok, warn, fail, info, dim, title,
  runMysql, meaningfulMysqlError, runDbProbe,
} from './lib/env.mjs'

const args = new Set(process.argv.slice(2))
const CHECK_ONLY = args.has('--check-only')
const DB_ONLY = args.has('--db-only')
const FORCE = args.has('--force')
const REINSTALL = args.has('--reinstall')

let blocking = 0
const problems = []
const block = (what, how) => { blocking++; problems.push({ what, how }); fail(what) }

// ═══════════════════════════════════════════════ 1. System prerequisites ════
title('1/5  Checking system prerequisites')

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor >= 18) ok(`Node.js ${process.versions.node}`)
else block(`Node.js ${process.versions.node} is too old (need 18+)`,
           'Install the current LTS from https://nodejs.org')

const npmVersion = capture('npm', ['--version'])
if (npmVersion) ok(`npm ${npmVersion}`)
else block('npm not found', 'npm ships with Node.js — reinstall Node.js')

const py = findPython()
if (py) ok(`Python ${py.version}  (${py.cmd})`)
else block('Python 3.9+ not found',
           IS_WINDOWS
             ? 'Install from https://python.org and tick "Add python.exe to PATH"'
             : 'Install python3 (e.g. apt install python3 python3-venv / brew install python)')

const mysqlVersion = capture('mysql', ['--version'])
if (mysqlVersion) {
  ok(`MySQL client ${mysqlVersion.replace(/^mysql\s+/i, '').split(',')[0]}`)
} else {
  // Not fatal: the app only needs a reachable server, and Docker provides one.
  warn('MySQL client not found on PATH')
  dim('    The database cannot be created automatically. Either:')
  dim('      • add MySQL to PATH, or')
  dim('      • run `docker compose up` instead (brings its own MySQL), or')
  dim('      • create the database by hand from db/schema.sql')
}

if (blocking) {
  title('Cannot continue — missing system software')
  for (const p of problems) console.log(`  ✗ ${p.what}\n    ${p.how}`)
  console.log('\nInstall the above, then run this again.\n')
  process.exit(1)
}

if (CHECK_ONLY) { console.log('\nAll prerequisites satisfied.\n'); process.exit(0) }

// ══════════════════════════════════════════════════ 2. Configuration ════════
if (!DB_ONLY) {
  title('2/5  Configuration files')
  for (const [dir, label] of [[BACKEND, 'backend'], [FRONTEND, 'frontend']]) {
    const env = join(dir, '.env')
    const example = join(dir, '.env.example')
    if (existsSync(env)) {
      ok(`${label}/.env already exists — left untouched`)
    } else if (existsSync(example)) {
      copyFileSync(example, env)
      ok(`${label}/.env created from .env.example`)
      if (label === 'backend') warn('    Set DB_PASSWORD in backend/.env before starting')
    } else {
      warn(`${label}/.env.example is missing`)
    }
  }
}

// ═════════════════════════════════════════════════════ 3. Dependencies ═════
if (!DB_ONLY) {
  title('3/5  Backend dependencies (Python)')
  if (venvReady()) {
    ok('virtualenv already present')
  } else {
    info('creating virtualenv in backend/venv ...')
    const r = run(py.cmd, ['-m', 'venv', VENV])
    if (r.status !== 0) {
      fail('could not create the virtualenv')
      dim('    On Debian/Ubuntu you may need:  sudo apt install python3-venv')
      process.exit(1)
    }
    ok('virtualenv created')
  }
  info('installing Python packages ...')
  run(venvPython(), ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'])
  const r = run(venvPython(), ['-m', 'pip', 'install', '--quiet', '-r', join(BACKEND, 'requirements.txt')])
  if (r.status !== 0) { fail('pip install failed'); process.exit(1) }
  ok('Python packages installed')

  title('4/5  Frontend dependencies (npm)')

  const lockfile = join(FRONTEND, 'package-lock.json')
  const nodeModules = join(FRONTEND, 'node_modules')
  const installMarker = join(nodeModules, '.package-lock.json')

  // `npm ci` deletes node_modules and rebuilds it from scratch. That is correct
  // for a first install or CI, but re-running it on every setup is slow and, on
  // Windows, actively dangerous: if any file is locked (editor, antivirus, a
  // running dev server) the wipe half-completes and leaves a broken tree.
  // So: only install when something has actually changed.
  const upToDate =
    existsSync(installMarker) &&
    existsSync(lockfile) &&
    statSync(installMarker).mtimeMs >= statSync(lockfile).mtimeMs

  if (upToDate && !REINSTALL) {
    ok('npm packages already up to date — skipping')
    dim('    Force a clean reinstall with:  npm run setup -- --reinstall')
  } else {
    const useCi = existsSync(lockfile)
    info(useCi ? 'running npm ci ...' : 'no lockfile found, running npm install ...')
    const f = run('npm', [useCi ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: FRONTEND })

    if (f.status !== 0) {
      fail('npm install failed')
      dim('')
      dim('    This usually means node_modules is in a broken state — on Windows,')
      dim('    npm could not delete it because a file was locked.')
      dim('')
      dim('    Fix it in three steps:')
      dim('      1. Close any editor, terminal or dev server using this folder')
      dim('      2. Delete the folder:')
      dim(IS_WINDOWS
        ? '           cmd //c "rmdir /s /q frontend\\node_modules"'
        : '           rm -rf frontend/node_modules')
      dim('      3. Run this again:  npm run setup')
      dim('')
      dim('    If it fails again on the Cypress step, Cypress only powers the')
      dim('    end-to-end tests and is not needed to run the app. Skip its binary:')
      dim(IS_WINDOWS
        ? '           set CYPRESS_INSTALL_BINARY=0 && npm run setup'
        : '           CYPRESS_INSTALL_BINARY=0 npm run setup')
      process.exit(1)
    }
    ok('npm packages installed')
  }
}

// ═══════════════════════════════════════════════════════ 5. Database ═══════
title(`${DB_ONLY ? '1/1' : '5/5'}  Database`)

const schema = join(ROOT, 'db', 'schema.sql')
const seed = join(ROOT, 'db', 'seed.sql')

if (!existsSync(schema)) {
  warn('db/schema.sql not found — skipping database setup')
} else if (!mysqlVersion) {
  warn('MySQL client unavailable — skipping automatic database setup')
  dim(`    Create it manually:  mysql -u root -p < db/schema.sql`)
} else {
  const env = readEnv(join(BACKEND, '.env'))
  const host = env.DB_HOST || 'localhost'
  const user = env.DB_USER || 'root'
  const pass = env.DB_PASSWORD || ''
  const name = env.DB_NAME || 'social_app'

  // The password travels via MYSQL_PWD (inside runMysql) rather than -p, so it
  // never appears in the process list or in shell history.
  //
  // Show MySQL's own error rather than a generic message: "access denied" and
  // "can't connect" need completely different fixes, and guessing wastes time.
  const ping = runMysql(['-h', host, '-u', user, '-e', 'SELECT 1'], { password: pass })

  if (ping.status !== 0) {
    const raw = `${ping.stderr || ''}\n${ping.stdout || ''}`
    const err = meaningfulMysqlError(raw)
    fail(`cannot connect to MySQL at ${host} as "${user}"`)
    if (err) dim(`\n    MySQL said: ${err}\n`)

    if (/access denied/i.test(err)) {
      dim('    The server is running, but the credentials are wrong.')
      dim(`    DB_USER="${user}" and DB_PASSWORD are read from backend/.env.`)
      dim('')
      dim('    Test your real password directly:')
      dim(`        mysql -u ${user} -p`)
      dim('    If that works, put the SAME password into backend/.env as DB_PASSWORD.')
      dim('    (A password containing # or spaces must be wrapped in quotes.)')
    } else if (/can't connect|connection refused|2003|2002/i.test(err)) {
      dim('    The MySQL server is not reachable — it is probably not running.')
      dim(IS_WINDOWS
        ? '        net start MySQL93      (or start it from services.msc)'
        : '        sudo service mysql start')
    } else {
      dim('    Check that the server is running and that backend/.env is correct.')
    }
    dim('')
    dim('    Alternative that needs no local MySQL:   docker compose up')
    process.exit(1)
  }
  ok(`connected to MySQL at ${host} as "${user}"`)

  if (FORCE) {
    warn(`dropping database "${name}" (--force)`)
    runMysql(['-h', host, '-u', user, '-e', `DROP DATABASE IF EXISTS \`${name}\``], { password: pass })
  }

  // Feeding the file on stdin is the portable way to apply a .sql file:
  // `<` redirection requires a shell and behaves differently on Windows.
  const feed = (file) =>
    runMysql(['-h', host, '-u', user], { password: pass, input: readFileSync(file, 'utf8') })

  const s = feed(schema)
  if (s.status !== 0) {
    fail('applying db/schema.sql failed')
    console.log(s.stderr)
    process.exit(1)
  }
  ok(`schema applied to "${name}"`)

  if (existsSync(seed)) {
    const d = feed(seed)
    if (d.status !== 0) warn('seed data failed to apply (schema is fine)')
    else ok('seed data applied')
  }

  // The mysql CLI succeeding does not mean the app can connect: it is a
  // different client with different auth defaults. Verify the path the Flask
  // app actually uses, so a mismatch surfaces here and not as a red error
  // message in the browser.
  if (!DB_ONLY) {
    const probe = runDbProbe({ inherit: false })
    if (probe && probe.status !== 0) {
      fail('the Python app CANNOT connect, even though the mysql client can')
      dim('')
      const lines = `${probe.stdout || ''}${probe.stderr || ''}`.split(/\r?\n/)
      for (const l of lines) if (l.trim()) dim(`    ${l}`)
      dim('')
      dim('    Re-run this diagnosis at any time with:  npm run db:probe')
      process.exit(1)
    }
    if (probe) ok('the Flask app can reach the database')

    // The ten autonomous agents (requirement 2.d) need accounts before the
    // simulation has anything to run.
    const seedAgents = runDbProbe.name && venvReady()
      ? run(venvPython(), [join(BACKEND, 'tools', 'seed_agents.py')],
            { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8' })
      : null
    if (seedAgents && seedAgents.status === 0) {
      const line = `${seedAgents.stdout || ''}`.trim().split(/\r?\n/).pop()
      ok(line || 'agent accounts ready')
    } else if (seedAgents) {
      warn('could not create the agent accounts')
      dim('    Run it directly to see why:  npm run agents:seed')
    }
  }
}

// ═══════════════════════════════════════════════════════════ Summary ═══════
title('Setup complete')
console.log(`
  Start the app with:

      npm run dev

  or do everything in one step next time:

      npm start
`)
