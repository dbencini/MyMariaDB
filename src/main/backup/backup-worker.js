import { workerData, parentPort } from 'worker_threads'
import mysql from 'mysql2/promise'
import { escape as mysqlEscape } from 'mysql2'
import mssql from 'mssql'
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import archiver from 'archiver'
import { applyAll } from './transforms.js'

const { action, connConfig, options } = workerData

let cancelled = false
parentPort.on('message', msg => { if (msg.type === 'cancel') cancelled = true })

function emit(partial) {
  parentPort.postMessage({
    phase: 'data', table: null, rowsDone: 0, rowsTotal: 0,
    done: false, status: 'running', level: 'info', message: '',
    ...partial
  })
}

async function connectMySQL(cfg) {
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port,
    user: cfg.username, password: cfg.password,
    multipleStatements: false
  })
  return conn
}

async function connectMSSQL(cfg) {
  return mssql.connect({
    server: cfg.host, port: cfg.port,
    user: cfg.username, password: cfg.password,
    database: cfg.database || undefined,
    options: { trustServerCertificate: true }
  })
}

async function zipFile(sqlPath, zipPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.file(sqlPath, { name: sqlPath.split(/[\\/]/).pop() })
    archive.finalize()
  })
}

async function runBackup() {
  const { database, tables, mode, includeObjects, outputPath, format } = options
  const isMySQL = connConfig.type !== 'mssql'
  const conn = isMySQL ? await connectMySQL(connConfig) : await connectMSSQL(connConfig)
  const stream = createWriteStream(outputPath, { encoding: 'utf8' })
  const w = s => stream.write(s + '\n')

  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    w(`-- MyMariaDB Backup`)
    w(`-- Source: ${database}`)
    w(`-- Date: ${now}`)
    w(`-- Tables: ${tables.length}`)
    w(`-- Connection type: ${connConfig.type}`)
    w(``)
    if (isMySQL) { w(`SET NAMES utf8mb4;`); w(`SET FOREIGN_KEY_CHECKS=0;`); w(`SET UNIQUE_CHECKS=0;`) }
    w(``)

    if (isMySQL) await conn.query(`USE \`${database}\``)

    // Schema phase
    if (mode === 'schema+data' || mode === 'schema') {
      for (const tableName of tables) {
        if (cancelled) break
        emit({ phase: 'schema', table: tableName, message: `Schema: ${tableName}` })
        if (isMySQL) {
          const [[row]] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``)
          w(`-- TABLE_SCHEMA: ${tableName}`)
          w(`DROP TABLE IF EXISTS \`${tableName}\`;`)
          w(applyAll(row['Create Table']) + ';')
          w(``)
        } else {
          const cols = await conn.request()
            .input('tbl', mssql.NVarChar, tableName)
            .query(
              `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
               FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl ORDER BY ORDINAL_POSITION`
            )
          const colDefs = cols.recordset.map(c => {
            const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : c.CHARACTER_MAXIMUM_LENGTH})` : ''
            const nullable = c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'
            const def = c.COLUMN_DEFAULT ? ` DEFAULT ${c.COLUMN_DEFAULT}` : ''
            return `  [${c.COLUMN_NAME}] ${c.DATA_TYPE}${len} ${nullable}${def}`
          }).join(',\n')
          w(`-- TABLE_SCHEMA: ${tableName}`)
          w(`IF OBJECT_ID('[${tableName}]', 'U') IS NOT NULL DROP TABLE [${tableName}];`)
          w(`CREATE TABLE [${tableName}] (\n${colDefs}\n);`)
          w(``)
        }
      }
    }

    // Data phase
    if (mode === 'schema+data' || mode === 'data') {
      for (const tableName of tables) {
        if (cancelled) break
        let rowsTotal = 0
        if (isMySQL) {
          const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``)
          rowsTotal = Number(total)
        } else {
          const r = await conn.request().query(`SELECT COUNT(*) AS total FROM [${tableName}]`)
          rowsTotal = r.recordset[0].total
        }

        w(`-- TABLE_DATA: ${tableName}`)
        let offset = 0
        const batchSize = 1000

        while (offset < rowsTotal) {
          if (cancelled) break
          let rows
          if (isMySQL) {
            const [r] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT ${batchSize} OFFSET ${offset}`)
            rows = r
          } else {
            const r = await conn.request().query(
              `SELECT * FROM [${tableName}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY`
            )
            rows = r.recordset
          }
          if (rows.length === 0) break

          if (isMySQL) {
            const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ')
            const vals = rows.map(row =>
              `(${Object.values(row).map(v => v === null ? 'NULL' : mysqlEscape(v)).join(', ')})`
            ).join(',\n')
            stream.write(`INSERT INTO \`${tableName}\` (${cols}) VALUES\n${vals};\n`)
          } else {
            const cols = Object.keys(rows[0]).map(c => `[${c}]`).join(', ')
            const vals = rows.map(row =>
              `(${Object.values(row).map(v => {
                if (v === null) return 'NULL'
                if (typeof v === 'number') return String(v)
                if (v instanceof Date) return `'${v.toISOString()}'`
                return `N'${String(v).replace(/'/g, "''")}'`
              }).join(', ')})`
            ).join(',\n')
            stream.write(`INSERT INTO [${tableName}] (${cols}) VALUES\n${vals};\n`)
          }

          offset += rows.length
          emit({ phase: 'data', table: tableName, rowsDone: offset, rowsTotal, message: `Data: ${tableName} ${offset}/${rowsTotal} rows` })
        }
        w(``)
      }
    }

    // Objects phase (MySQL only)
    if (isMySQL && includeObjects) {
      const [views] = await conn.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`, [database]
      )
      for (const { TABLE_NAME } of views) {
        if (cancelled) break
        emit({ phase: 'objects', table: TABLE_NAME, message: `View: ${TABLE_NAME}` })
        const [[vrow]] = await conn.query(`SHOW CREATE VIEW \`${TABLE_NAME}\``)
        w(`DROP VIEW IF EXISTS \`${TABLE_NAME}\`;`)
        w(applyAll(vrow['Create View']) + ';')
        w(``)
      }

      const [procs] = await conn.query(
        `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`, [database]
      )
      for (const { ROUTINE_NAME } of procs) {
        if (cancelled) break
        const [[prow]] = await conn.query(`SHOW CREATE PROCEDURE \`${ROUTINE_NAME}\``)
        w(`DROP PROCEDURE IF EXISTS \`${ROUTINE_NAME}\`;`)
        w(`DELIMITER //`)
        w(applyAll(prow['Create Procedure']) + ' //')
        w(`DELIMITER ;`)
        w(``)
      }

      const [funcs] = await conn.query(
        `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'`, [database]
      )
      for (const { ROUTINE_NAME } of funcs) {
        if (cancelled) break
        const [[frow]] = await conn.query(`SHOW CREATE FUNCTION \`${ROUTINE_NAME}\``)
        w(`DROP FUNCTION IF EXISTS \`${ROUTINE_NAME}\`;`)
        w(`DELIMITER //`)
        w(applyAll(frow['Create Function']) + ' //')
        w(`DELIMITER ;`)
        w(``)
      }

      const [triggers] = await conn.query(
        `SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ?`, [database]
      )
      for (const { TRIGGER_NAME } of triggers) {
        if (cancelled) break
        const [[trow]] = await conn.query(`SHOW CREATE TRIGGER \`${TRIGGER_NAME}\``)
        w(`DROP TRIGGER IF EXISTS \`${TRIGGER_NAME}\`;`)
        w(`DELIMITER //`)
        const triggerSQL = trow['SQL Original Statement'] ?? trow['Statement'] ?? ''
        w(applyAll(triggerSQL) + ' //')
        w(`DELIMITER ;`)
        w(``)
      }
    }

    if (isMySQL && !cancelled) { w(`SET FOREIGN_KEY_CHECKS=1;`); w(`SET UNIQUE_CHECKS=1;`) }
    await new Promise((res, rej) => stream.end(err => err ? rej(err) : res()))

    if (cancelled) {
      await unlink(outputPath).catch(() => {})
      emit({ done: true, status: 'cancelled', message: 'Backup cancelled', level: 'warn' })
      return
    }

    if (!cancelled && (format === 'zip' || format === 'both')) {
      emit({ phase: 'zip', message: 'Creating zip…' })
      const zipPath = outputPath.replace(/\.sql$/, '.zip')
      await zipFile(outputPath, zipPath)
      if (format === 'zip') await unlink(outputPath).catch(() => {})
    }

    emit({ done: true, status: 'completed', message: 'Backup complete ✓' })
  } catch (err) {
    stream.destroy()
    await unlink(outputPath).catch(() => {})
    emit({ done: true, status: 'failed', message: err.message, level: 'error' })
  } finally {
    try { if (isMySQL) await conn.end(); else await conn.close() } catch {}
  }
}

if (action === 'backup') runBackup()
