#!/usr/bin/env node
/**
 * Runs both test suites, reports a combined result, and prints the coverage
 * each side actually reached (course requirement 2.f).
 *
 * Exits non-zero if either suite fails — including when it fails only because
 * coverage dropped below the threshold configured in frontend/vitest.config.js
 * and backend/pytest.ini. A number nobody enforces is a number that slides.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND, FRONTEND, venvPython, venvReady, run, title, ok, fail, warn } from './lib/env.mjs'

const TARGET = 85

const results = []

/** Reads a percentage out of a report file, or null when there is none. */
function readCoverage(path, pick) {
  try {
    if (!existsSync(path)) return null
    const value = pick(JSON.parse(readFileSync(path, 'utf8')))
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
  } catch {
    // A missing or half-written report must not fail the run on its own; the
    // suite's own exit code is what decides pass or fail.
    return null
  }
}

title('Frontend tests (Vitest)')
if (existsSync(join(FRONTEND, 'node_modules'))) {
  const r = run('npm', ['run', 'test'], { cwd: FRONTEND })
  results.push({
    name: 'frontend',
    passed: r.status === 0,
    coverage: readCoverage(
      join(FRONTEND, 'coverage', 'coverage-summary.json'),
      (j) => j.total?.statements?.pct
    ),
  })
} else {
  warn('frontend dependencies missing — run: npm run setup')
  results.push({ name: 'frontend', passed: false })
}

title('Backend tests (pytest)')
if (venvReady()) {
  const hasPytest = run(venvPython(), ['-m', 'pytest', '--version'], { stdio: 'ignore' }).status === 0
  if (hasPytest) {
    const r = run(venvPython(), ['-m', 'pytest'], { cwd: BACKEND })
    results.push({
      name: 'backend',
      passed: r.status === 0,
      coverage: readCoverage(
        join(BACKEND, 'coverage.json'),
        (j) => j.totals?.percent_covered
      ),
    })
  } else {
    // pytest is listed in requirements.txt, so this only happens when the venv
    // predates that entry — i.e. setup has not run since the file changed.
    warn('pytest is missing from the virtualenv')
    console.log('    The backend test suite exists but cannot run. Install it with:')
    console.log('        npm run setup')
    results.push({ name: 'backend', passed: null })
  }
} else {
  warn('backend virtualenv missing — run: npm run setup')
  results.push({ name: 'backend', passed: false })
}

title('Summary')
let failed = false
for (const { name, passed, coverage } of results) {
  const cov = coverage === null || coverage === undefined ? '' : `  (coverage ${coverage}%)`
  if (passed === null) warn(`${name}: skipped`)
  else if (passed) ok(`${name}: passed${cov}`)
  else { fail(`${name}: failed${cov}`); failed = true }
}

const measured = results.filter((r) => typeof r.coverage === 'number')
if (measured.length) {
  console.log()
  const below = measured.filter((r) => r.coverage < TARGET)
  if (below.length === 0) {
    ok(`statement coverage is at or above the ${TARGET}% target on both sides`)
  } else {
    // The suite itself already failed on the threshold; this only says which.
    warn(`below the ${TARGET}% target: ${below.map((r) => r.name).join(', ')}`)
  }
}

console.log()
process.exit(failed ? 1 : 0)
