import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { getConnection } from '../db/connection-repository.js'
import { getActiveConnection } from '../connections/connection-manager.js'
import { getDb } from '../db/sqlite.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerPath = join(__dirname, 'backup-worker.js')

const _jobs = new Map()

function getWebContents() {
  const wins = BrowserWindow.getAllWindows()
  return wins[0]?.webContents ?? null
}

function spawnWorker(action, connConfig, options) {
  const jobId = randomUUID()
  const worker = new Worker(workerPath, { workerData: { action, connConfig, options } })
  _jobs.set(jobId, worker)

  worker.on('message', event => {
    getWebContents()?.send('backup:progress', { ...event, jobId })
    if (event.done) {
      worker.terminate()
      setImmediate(() => _jobs.delete(jobId))
    }
  })

  worker.on('error', err => {
    getWebContents()?.send('backup:progress', {
      jobId, done: true, status: 'failed', message: err.message, level: 'error',
      phase: 'data', table: null, rowsDone: 0, rowsTotal: 0
    })
    worker.terminate()
    setImmediate(() => _jobs.delete(jobId))
  })

  return jobId
}

export function registerBackupIpc() {
  ipcMain.handle('backup:getTables', async (_, { connectionId, database }) => {
    const stored = getConnection(connectionId)
    const conn = await getActiveConnection(stored)
    try {
      if (stored.type === 'mssql') {
        const r = await conn.request().query(
          `SELECT t.TABLE_NAME AS name, p.rows AS rowCount
           FROM INFORMATION_SCHEMA.TABLES t
           LEFT JOIN sys.partitions p ON p.object_id = OBJECT_ID(t.TABLE_NAME) AND p.index_id < 2
           WHERE t.TABLE_TYPE = 'BASE TABLE' AND t.TABLE_CATALOG = DB_NAME()
           ORDER BY t.TABLE_NAME`
        )
        return r.recordset
      } else {
        await conn.query(`USE \`${database}\``)
        const [rows] = await conn.query(
          `SELECT TABLE_NAME AS name, TABLE_ROWS AS rowCount
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`, [database]
        )
        return rows.map(r => ({ name: r.name, rowCount: Number(r.rowCount ?? 0) }))
      }
    } catch {
      return []
    }
  })

  ipcMain.handle('backup:start', async (_, options) => {
    const stored = getConnection(options.connectionId)
    if (!stored) throw new Error(`Connection ${options.connectionId} not found`)
    const jobId = spawnWorker('backup', stored, options)
    return { jobId }
  })

  ipcMain.handle('backup:cancel', (_, { jobId }) => {
    const worker = _jobs.get(jobId)
    if (worker) { worker.postMessage({ type: 'cancel' }); _jobs.delete(jobId) }
  })

  ipcMain.handle('restore:start', async (_, options) => {
    const stored = getConnection(options.connectionId)
    if (!stored) throw new Error(`Connection ${options.connectionId} not found`)
    const db = getDb()
    const dbPath = db.name
    const jobId = spawnWorker('restore', stored, { ...options, dbPath })
    return { jobId }
  })

  ipcMain.handle('restore:start-chunked', async (_, options) => {
    const stored = getConnection(options.connectionId)
    if (!stored) throw new Error(`Connection ${options.connectionId} not found`)
    const db = getDb()
    const dbPath = db.name
    const existing = db.prepare(
      `SELECT rj.id, rc.rows_done FROM restore_jobs rj
       LEFT JOIN restore_checkpoints rc ON rc.job_id = rj.id
       WHERE rj.backup_file = ? AND rj.target_database = ? AND rj.table_name = ? AND rj.status IN ('in_progress','paused')
       ORDER BY rj.created_at DESC LIMIT 1`
    ).get(options.filePath, options.database, options.tableName)
    const resumeFromRow = existing?.rows_done ?? 0
    const jobId = spawnWorker('restore-chunked', stored, { ...options, dbPath, resumeFromRow })
    return { jobId, resumeFromRow }
  })

  ipcMain.handle('restore:cancel', (_, { jobId }) => {
    const worker = _jobs.get(jobId)
    if (worker) { worker.postMessage({ type: 'cancel' }); _jobs.delete(jobId) }
  })
}
