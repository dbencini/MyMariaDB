import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          include: ['tests/main/**/*.test.js'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'renderer',
          include: ['tests/renderer/**/*.test.jsx'],
          environment: 'jsdom',
          setupFiles: ['tests/renderer/setup.js']
        }
      }
    ]
  }
})
