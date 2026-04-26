import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb } from '../../../src/main/db/sqlite.js'

describe('sqlite', () => {
  let db

  afterEach(() => { if (db) db.close() })

  it('creates all required tables', () => {
    db = initDb(':memory:')
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name)
    expect(tables).toContain('connections')
    expect(tables).toContain('restore_jobs')
    expect(tables).toContain('restore_checkpoints')
    expect(tables).toContain('migrations')
  })

  it('is idempotent — running migrations twice does not throw', () => {
    db = initDb(':memory:')
    expect(() => initDb(':memory:')).not.toThrow()
  })
})
