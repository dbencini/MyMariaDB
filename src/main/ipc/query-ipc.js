import { ipcMain } from 'electron'
import { getConnection as getStoredConnection } from '../db/connection-repository.js'
import { getActiveConnection } from '../connections/connection-manager.js'

const _versionCache = new Map()

async function fetchServerVersion(conn, type, connectionId) {
  if (_versionCache.has(connectionId)) return _versionCache.get(connectionId)
  try {
    let v = ''
    if (type === 'mssql') {
      const r = await conn.request().query('SELECT @@VERSION AS v')
      v = r.recordset[0]?.v?.split('\n')[0] ?? ''
    } else {
      const [[row]] = await conn.query('SELECT VERSION() AS v')
      v = row?.v ?? ''
    }
    _versionCache.set(connectionId, v)
    return v
  } catch { return '' }
}

function wrapWithLimit(sql, limit, type) {
  if (type === 'mssql') return `SELECT TOP ${limit} * FROM (${sql}) AS _q`
  return `SELECT * FROM (${sql}) AS _q LIMIT ${limit}`
}

export function registerQueryIpc() {
  ipcMain.handle('query:execute', async (_, { connectionId, database, sql, limit }) => {
    const start = Date.now()
    try {
      const stored = getStoredConnection(connectionId)
      const conn = await getActiveConnection(stored)
      const type = stored.type

      const serverVersion = await fetchServerVersion(conn, type, connectionId)
      const finalSql = limit > 0 ? wrapWithLimit(sql.trim(), limit, type) : sql.trim()

      if (type === 'mssql') {
        if (database) await conn.request().query(`USE [${database}]`)
        const result = await conn.request().query(finalSql)
        return {
          columns: result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [],
          rows: result.recordset,
          rowCount: result.rowsAffected?.[0] ?? result.recordset.length,
          durationMs: Date.now() - start,
          serverVersion
        }
      } else {
        if (database) await conn.query(`USE \`${database}\``)
        const [rows, fields] = await conn.query(finalSql)
        if (Array.isArray(rows)) {
          return {
            columns: fields ? fields.map(f => f.name) : [],
            rows: rows.map(r => ({ ...r })),
            rowCount: rows.length,
            durationMs: Date.now() - start,
            serverVersion
          }
        }
        return {
          columns: [],
          rows: [],
          rowCount: rows.affectedRows ?? 0,
          durationMs: Date.now() - start,
          serverVersion
        }
      }
    } catch (err) {
      return { error: err.message, durationMs: Date.now() - start }
    }
  })
}
