#!/usr/bin/env node
/** Production build of the frontend, from the repo root. */
import { FRONTEND, run, fail } from './lib/env.mjs'

const r = run('npm', ['run', 'build'], { cwd: FRONTEND })
if (r.status !== 0) { fail('build failed'); process.exit(1) }
