import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _db = null

export function initDb(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name     VARCHAR(255) PRIMARY KEY,
    run_at   VARCHAR(30)  NOT NULL
  )`)

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const already = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(file)
    if (!already) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      db.exec(sql)
      db.prepare('INSERT INTO migrations (name, run_at) VALUES (?, ?)').run(file, new Date().toISOString())
    }
  }

  return db
}

export function getDb() {
  if (!_db) throw new Error('DB not initialized — call openDb() first')
  return _db
}

export function openDb(dbPath) {
  _db = initDb(dbPath)
  return _db
}
