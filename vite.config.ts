import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/MarkSheet/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
