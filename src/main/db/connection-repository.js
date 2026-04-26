import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import { getDb } from './sqlite.js'

export function listConnections() {
  return getDb()
    .prepare('SELECT id, name, type, host, port, database, username, created_at FROM connections ORDER BY name')
    .all()
}

export function getConnection(id) {
  const row = getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id)
  if (!row) return null
  return {
    ...row,
    password: safeStorage.decryptString(Buffer.from(row.password, 'base64'))
  }
}

export function createConnection(data) {
  const id = randomUUID()
  const encPw = safeStorage.encryptString(data.password).toString('base64')
  getDb().prepare(`
    INSERT INTO connections (id, name, type, host, port, database, username, password, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.type, data.host, data.port, data.database ?? null, data.username, encPw, new Date().toISOString())
  return id
}

export function updateConnection(id, data) {
  const encPw = safeStorage.encryptString(data.password).toString('base64')
  getDb().prepare(`
    UPDATE connections
    SET name=?, type=?, host=?, port=?, database=?, username=?, password=?
    WHERE id=?
  `).run(data.name, data.type, data.host, data.port, data.database ?? null, data.username, encPw, id)
}

export function deleteConnection(id) {
  getDb().prepare('DELETE FROM connections WHERE id = ?').run(id)
}
