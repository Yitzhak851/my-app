import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The react plugin MUST be listed here too: without it JSX is not transformed with the
// automatic runtime, which is what produced "ReferenceError: React is not defined".
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: true,
    // Cypress specs are run by Cypress, not by Vitest.
    exclude: ['node_modules/**', 'dist/**', 'cypress/**'],
    coverage: {
      provider: 'v8',
      // json-summary is what scripts/test.mjs reads for the combined report.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/setupTests.js', 'src/tests/**', 'src/assets/**'],
      // Course requirement 2.f. Set at the level the suite actually reaches, so
      // the build fails when coverage drops rather than aspiring to a number
      // nobody enforces. Raise these as coverage improves; never lower them to
      // make a red run green.
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 80,
        branches: 70,
      },
    },
  },
})
