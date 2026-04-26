import { ipcMain } from 'electron'
import { getConnection as getStoredConnection } from '../db/connection-repository.js'
import { getActiveConnection } from '../connections/connection-manager.js'

export function registerSchemaIpc() {
  ipcMain.handle('schema:listDatabases', async (_, connectionId) => {
    const stored = getStoredConnection(connectionId)
    const conn = await getActiveConnection(stored)

    if (stored.type === 'mssql') {
      const result = await conn.request().query(
        "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name"
      )
      return result.recordset.map((r) => r.name)
    } else {
      const [rows] = await conn.query('SHOW DATABASES')
      const excluded = new Set(['information_schema', 'performance_schema', 'sys', 'mysql'])
      return rows.map((r) => r.Database).filter((d) => !excluded.has(d))
    }
  })

  ipcMain.handle('schema:listObjects', async (_, connectionId, database) => {
    const stored = getStoredConnection(connectionId)
    const conn = await getActiveConnection(stored)

    if (stored.type === 'mssql') {
      const result = await conn.request().query(`
        SELECT t.name, 'TABLE' as object_type FROM [${database}].INFORMATION_SCHEMA.TABLES t WHERE t.TABLE_TYPE = 'BASE TABLE'
        UNION ALL
        SELECT v.name, 'VIEW' FROM [${database}].INFORMATION_SCHEMA.VIEWS v
        UNION ALL
        SELECT r.ROUTINE_NAME as name, r.ROUTINE_TYPE as object_type FROM [${database}].INFORMATION_SCHEMA.ROUTINES r
        ORDER BY name
      `)
      return result.recordset
    } else {
      const [tables] = await conn.query(
        'SELECT TABLE_NAME as name, TABLE_TYPE as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [database]
      )
      const [procs] = await conn.query(
        'SELECT ROUTINE_NAME as name, ROUTINE_TYPE as object_type FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME',
        [database]
      )
      const [triggers] = await conn.query(
        'SELECT TRIGGER_NAME as name, \'TRIGGER\' as object_type FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME',
        [database]
      )
      return [...tables, ...procs, ...triggers]
    }
  })
}
