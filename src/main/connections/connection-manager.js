import mysql from 'mysql2/promise'
import mssql from 'mssql'

const _connections = new Map()

export async function getActiveConnection(config) {
  if (_connections.has(config.id)) return _connections.get(config.id)

  let conn
  if (config.type === 'mysql' || config.type === 'mariadb') {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database || undefined,
      multipleStatements: false
    })
    conn._type = config.type
  } else {
    conn = await mssql.connect({
      server: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database || undefined,
      options: { trustServerCertificate: true }
    })
    conn._type = 'mssql'
  }

  _connections.set(config.id, conn)
  return conn
}

export async function closeConnection(id) {
  const conn = _connections.get(id)
  if (!conn) return
  try {
    if (conn._type === 'mssql') await conn.close()
    else await conn.end()
  } catch { /* ignore close errors */ }
  _connections.delete(id)
}

export async function testConnection(config) {
  try {
    const conn = await getActiveConnection(config)
    if (config.type === 'mssql') {
      await conn.request().query('SELECT 1')
    } else {
      await conn.query('SELECT 1')
    }
    return { ok: true }
  } catch (err) {
    await closeConnection(config.id).catch(() => {})
    return { ok: false, error: err.message }
  }
}
