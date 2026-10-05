import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative Base -> funktioniert als statischer Export (Fallback / Abgabe) ohne Server-Root.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Vitest: reine Rechenmodule (src/lib) laufen in Node, ohne DOM-Umgebung.
  // ledger.test.js liest die echte public/data/wildchat.json, keine Fixtures.
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
