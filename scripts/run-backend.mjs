#!/usr/bin/env node
/**
 * Runs any command through the backend virtualenv's Python, from the backend
 * directory. Saves every caller from having to know the platform-specific
 * venv layout (venv/bin vs venv\Scripts).
 *
 *   node scripts/run-backend.mjs -m pytest
 *   node scripts/run-backend.mjs -m pip install something
 */
import { BACKEND, venvPython, venvReady, run, fail } from './lib/env.mjs'

if (!venvReady()) {
  fail('Backend virtualenv missing. Run:  npm run setup')
  process.exit(1)
}

const r = run(venvPython(), process.argv.slice(2), { cwd: BACKEND })
process.exit(r.status ?? 1)
