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
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/setupTests.js', 'src/tests/**', 'src/assets/**'],
    },
  },
})
