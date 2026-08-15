import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build / dev-server config only.
// Test configuration lives in vitest.config.js so that the two concerns stay separate
// and the production build does not carry test-only settings.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Without strictPort, Vite silently moves to 5174/5175 when 5173 is taken.
    // That breaks the app in a confusing way: the backend's CORS_ORIGINS only
    // allows 5173, so every API call fails with a CORS error that looks like a
    // backend bug. Failing loudly on a busy port is far easier to diagnose.
    strictPort: true,
  },
})
