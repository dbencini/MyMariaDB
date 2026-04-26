import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        name: 'main',
        test: {
          include: ['tests/main/**/*.test.js'],
          environment: 'node'
        }
      },
      {
        name: 'renderer',
        test: {
          include: ['tests/renderer/**/*.test.jsx'],
          environment: 'jsdom',
          setupFiles: ['tests/renderer/setup.js']
        }
      }
    ]
  }
})
