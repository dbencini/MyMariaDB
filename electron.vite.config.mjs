import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const copyMigrations = {
  name: 'copy-migrations',
  closeBundle() {
    const src = resolve('src/main/db/migrations')
    const dest = resolve('out/main/migrations')
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dest, f))
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrations]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
