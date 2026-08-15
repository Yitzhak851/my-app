#!/usr/bin/env node
/**
 * Runs both test suites and reports a combined result.
 * Exits non-zero if either side fails, so it is usable in CI.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND, FRONTEND, venvPython, venvReady, run, title, ok, fail, warn } from './lib/env.mjs'

const results = []

title('Frontend tests (Vitest)')
if (existsSync(join(FRONTEND, 'node_modules'))) {
  const r = run('npm', ['run', 'test'], { cwd: FRONTEND })
  results.push(['frontend', r.status === 0])
} else {
  warn('frontend dependencies missing — run: npm run setup')
  results.push(['frontend', false])
}

title('Backend tests (pytest)')
if (venvReady()) {
  const hasPytest = run(venvPython(), ['-m', 'pytest', '--version'], { stdio: 'ignore' }).status === 0
  if (hasPytest) {
    const r = run(venvPython(), ['-m', 'pytest'], { cwd: BACKEND })
    results.push(['backend', r.status === 0])
  } else {
    // pytest is listed in requirements.txt, so this only happens when the venv
    // predates that entry — i.e. setup has not run since the file changed.
    warn('pytest is missing from the virtualenv')
    console.log('    The backend test suite exists but cannot run. Install it with:')
    console.log('        npm run setup')
    results.push(['backend', null])
  }
} else {
  warn('backend virtualenv missing — run: npm run setup')
  results.push(['backend', false])
}

title('Summary')
let failed = false
for (const [name, passed] of results) {
  if (passed === null) warn(`${name}: skipped`)
  else if (passed) ok(`${name}: passed`)
  else { fail(`${name}: failed`); failed = true }
}
console.log()
process.exit(failed ? 1 : 0)
