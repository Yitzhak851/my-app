import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build / dev-server config only.
// Test configuration lives in vitest.config.js so that the two concerns stay separate
// and the production build does not carry test-only settings.
export default defineConfig({
  plugins: [react()],
})
