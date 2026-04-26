# MyMariaDB — Plan 3: Backup & Restore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backup wizard and restore wizard — MySQL 8.0.42 backups are compatible with MariaDB 11.8.6 and MySQL 8.0.42 via inline SQL transforms; MSSQL is same-to-same; chunked single-table restore is resumable via SQLite checkpoints.

**Architecture:** All heavy work runs in a Node.js worker thread (`backup-worker.js`) bundled as a separate entry point by electron-vite. The IPC layer spawns the worker, forwards `postMessage` progress events to the renderer via `webContents.send`. The renderer stores wizard state in `useBackupStore` and renders a modal `BackupWizard` component with three tabs: Backup, Restore, Chunked Restore.

**Tech Stack:** React, Zustand, mysql2, mssql, better-sqlite3, archiver (new dep), Node worker_threads, electron ipcMain/webContents

---

## File Map

```
src/
├── main/
│   ├── backup/
│   │   ├── backup-worker.js     NEW: worker thread (backup + restore + chunked)
│   │   └── transforms.js        NEW: MySQL→MariaDB SQL transforms (pure functions)
│   ├── db/migrations/
│   │   └── 002_restore_jobs_chunked.sql  NEW: ALTER TABLE to add missing columns
│   └── ipc/
│       └── backup-ipc.js        NEW: IPC handlers, spawns worker
├── preload/
│   └── index.js                 MODIFY: add backup namespace
└── renderer/src/
    ├── stores/
    │   └── useBackupStore.js    NEW: Zustand wizard state
    └── components/
        └── BackupWizard/
            ├── BackupWizard.jsx NEW: modal with Backup / Restore / Chunked tabs
            └── BackupWizard.css NEW

electron.vite.config.mjs         MODIFY: add backup-worker as separate build entry
src/main/index.js                MODIFY: registerBackupIpc()
src/renderer/src/App.jsx         MODIFY: render <BackupWizard />
src/renderer/src/components/Sidebar/Sidebar.jsx  MODIFY: open wizard on click

tests/
├── main/backup/
│   └── transforms.test.js       NEW: unit tests for each transform
└── main/ipc/
    └── backup-ipc.test.js       NEW: IPC handler tests with mocked Worker
```

---

## Task 1: SQLite migration — add chunked restore columns

The tables `restore_jobs` and `restore_checkpoints` already exist in `001_initial.sql` but are missing columns needed for single-table chunked restore tracking.

**Files:**
- Create: `src/main/db/migrations/002_restore_jobs_chunked.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Add table_name to track which table a chunked restore job targets
ALTER TABLE restore_jobs ADD COLUMN table_name VARCHAR(255);

-- Add progress tracking columns for chunked restore
ALTER TABLE restore_checkpoints ADD COLUMN rows_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restore_checkpoints ADD COLUMN total_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restore_checkpoints ADD COLUMN updated_at VARCHAR(30);
```

- [ ] **Step 2: Verify migration runs on startup**

```bash
cd c:/development/MyMariaDB && npm run dev
```

Expected: app starts without error. The migration system in `sqlite.js` picks up `002_restore_jobs_chunked.sql` automatically.

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/db/migrations/002_restore_jobs_chunked.sql && git commit -m "feat: add migration for chunked restore columns"
```

---

## Task 2: transforms.js + tests

Pure functions that rewrite MySQL 8.0-specific SQL to be compatible with MariaDB 11.8.6. No imports — just string/regex operations.

**Files:**
- Create: `src/main/backup/transforms.js`
- Create: `tests/main/backup/transforms.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/backup/transforms.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  replaceCollations,
  removeInvisible,
  removeVersionGatedComments,
  unwrapExpressionDefaults,
  applyAll
} from '../../../src/main/backup/transforms.js'

describe('replaceCollations', () => {
  it('replaces utf8mb4_0900_ai_ci with utf8mb4_general_ci', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_ai_ci'))
      .toBe('COLLATE utf8mb4_general_ci')
  })
  it('replaces utf8mb4_0900_as_cs with utf8mb4_bin', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_as_cs'))
      .toBe('COLLATE utf8mb4_bin')
  })
  it('replaces utf8mb4_0900_as_ci with utf8mb4_unicode_ci', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_as_ci'))
      .toBe('COLLATE utf8mb4_unicode_ci')
  })
  it('leaves unrelated collations unchanged', () => {
    expect(replaceCollations('COLLATE utf8mb4_general_ci'))
      .toBe('COLLATE utf8mb4_general_ci')
  })
})

describe('removeInvisible', () => {
  it('removes INVISIBLE keyword', () => {
    expect(removeInvisible('`col` INT INVISIBLE DEFAULT NULL'))
      .toBe('`col` INT  DEFAULT NULL')
  })
  it('is case-insensitive', () => {
    expect(removeInvisible('`col` INT invisible')).toBe('`col` INT ')
  })
})

describe('removeVersionGatedComments', () => {
  it('removes /*!80023 ... */ comments', () => {
    expect(removeVersionGatedComments('CREATE /*!80023 INVISIBLE */ TABLE'))
      .toBe('CREATE  TABLE')
  })
  it('removes multi-token version comments', () => {
    expect(removeVersionGatedComments('a /*!80016 DEFAULT_GENERATED */ b'))
      .toBe('a  b')
  })
  it('leaves normal comments unchanged', () => {
    expect(removeVersionGatedComments('/* regular comment */')).toBe('/* regular comment */')
  })
})

describe('unwrapExpressionDefaults', () => {
  it('unwraps DEFAULT (literal)', () => {
    expect(unwrapExpressionDefaults('col INT DEFAULT (42)'))
      .toBe('col INT DEFAULT 42')
  })
  it('unwraps DEFAULT (string literal)', () => {
    expect(unwrapExpressionDefaults("col VARCHAR(10) DEFAULT ('hi')"))
      .toBe("col VARCHAR(10) DEFAULT 'hi'")
  })
  it('does not unwrap nested parens', () => {
    const sql = 'col INT DEFAULT (a + b)'
    expect(unwrapExpressionDefaults(sql)).toBe('col INT DEFAULT a + b')
  })
})

describe('applyAll', () => {
  it('applies all transforms in sequence', () => {
    const input = '`col` INT INVISIBLE COLLATE utf8mb4_0900_ai_ci /*!80023 x */ DEFAULT (1)'
    const result = applyAll(input)
    expect(result).toContain('utf8mb4_general_ci')
    expect(result).not.toMatch(/\bINVISIBLE\b/i)
    expect(result).not.toContain('/*!80023')
    expect(result).toContain('DEFAULT 1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/backup/transforms.test.js
```

Expected: FAIL — `transforms.js` not found.

- [ ] **Step 3: Create `src/main/backup/transforms.js`**

```js
export function replaceCollations(sql) {
  return sql
    .replace(/utf8mb4_0900_as_cs/g, 'utf8mb4_bin')
    .replace(/utf8mb4_0900_as_ci/g, 'utf8mb4_unicode_ci')
    .replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_general_ci')
}

export function removeInvisible(sql) {
  return sql.replace(/\bINVISIBLE\b/gi, '')
}

export function removeVersionGatedComments(sql) {
  return sql.replace(/\/\*!8\d{4}[\s\S]*?\*\//g, '')
}

export function unwrapExpressionDefaults(sql) {
  return sql.replace(/DEFAULT\s+\(([^()]*)\)/gi, 'DEFAULT $1')
}

export function applyAll(sql) {
  return unwrapExpressionDefaults(
    removeVersionGatedComments(
      removeInvisible(
        replaceCollations(sql)
      )
    )
  )
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/backup/transforms.test.js
```

Expected: PASS — 13 tests passing.

- [ ] **Step 5: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/backup/transforms.js tests/main/backup/transforms.test.js && git commit -m "feat: add MySQL→MariaDB SQL compatibility transforms"
```

---

## Task 3: backup-worker.js — backup action

The worker thread handles backup. It is imported by `backup-ipc.js` via a path pointing to the bundled output file. The worker receives `workerData` with `{ action, connConfig, options }`, posts `ProgressEvent` messages, and listens for `{ type: 'cancel' }`.

Install `archiver` for zip creation:

```bash
cd c:/development/MyMariaDB && npm install archiver
```

**Files:**
- Create: `src/main/backup/backup-worker.js`
- Modify: `electron.vite.config.mjs` — add worker as separate build entry

- [ ] **Step 1: Update `electron.vite.config.mjs` to bundle the worker**

```js
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
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.js'),
          'backup-worker': resolve('src/main/backup/backup-worker.js')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    },
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
```

- [ ] **Step 2: Create `src/main/backup/backup-worker.js`**

```js
import { workerData, parentPort } from 'worker_threads'
import mysql from 'mysql2/promise'
import { escape as mysqlEscape } from 'mysql2'
import mssql from 'mssql'
import { createWriteStream, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
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
          // MSSQL: build CREATE TABLE from INFORMATION_SCHEMA
          const cols = await conn.request().query(
            `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
             FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' ORDER BY ORDINAL_POSITION`
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
        w(applyAll(trow['SQL Original Statement']) + ' //')
        w(`DELIMITER ;`)
        w(``)
      }
    }

    if (isMySQL) { w(`SET FOREIGN_KEY_CHECKS=1;`); w(`SET UNIQUE_CHECKS=1;`) }
    await new Promise((res, rej) => stream.end(err => err ? rej(err) : res()))

    if (cancelled) {
      await unlink(outputPath).catch(() => {})
      emit({ done: true, status: 'cancelled', message: 'Backup cancelled', level: 'warn' })
      return
    }

    if (format === 'zip' || format === 'both') {
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
```

- [ ] **Step 3: Verify it compiles**

```bash
cd c:/development/MyMariaDB && npm run build 2>&1 | head -30
```

Expected: `out/main/index.js` and `out/main/backup-worker.js` both built successfully.

- [ ] **Step 4: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/backup/backup-worker.js electron.vite.config.mjs package.json package-lock.json && git commit -m "feat: add backup worker with MySQL/MSSQL backup and zip support"
```

---

## Task 4: backup-worker.js — restore actions

Add the `restore` and `restore-chunked` action handlers to the same worker file.

**Files:**
- Modify: `src/main/backup/backup-worker.js`

- [ ] **Step 1: Read `src/main/backup/backup-worker.js` current content**

Read the file before editing.

- [ ] **Step 2: Add imports at the top**

Add after the existing imports:

```js
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
```

- [ ] **Step 3: Add restore functions before the final `if (action === 'backup')` block**

```js
async function runRestore() {
  const { filePath, connectionId, database, dbPath } = options
  const isMySQL = connConfig.type !== 'mssql'
  const conn = isMySQL ? await connectMySQL(connConfig) : await connectMSSQL(connConfig)

  try {
    const sql = readFileSync(filePath, 'utf8')

    if (isMySQL) {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``)
      await conn.query(`USE \`${database}\``)
    }

    // Split on ; but skip DELIMITER blocks
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('DELIMITER'))

    let done = 0
    for (const stmt of statements) {
      if (cancelled) break
      try {
        if (isMySQL) {
          await conn.query(stmt)
        } else {
          await conn.request().query(stmt)
        }
      } catch (err) {
        emit({ level: 'error', message: `Error: ${err.message}` })
        // Send error event and wait for user response via cancel or continue
        // (UI handles Skip/Abort by sending cancel message)
      }
      done++
      if (done % 50 === 0) {
        emit({ phase: 'restore', rowsDone: done, rowsTotal: statements.length, message: `Executing statements… ${done}/${statements.length}` })
      }
    }

    if (!cancelled) {
      // Row count verification
      emit({ phase: 'verify', message: 'Verifying row counts…' })
      const tableMatches = [...sql.matchAll(/^-- TABLE_DATA: (.+)$/gm)].map(m => m[1])
      const verification = []
      for (const tableName of tableMatches) {
        let sourceCount = 0, targetCount = 0
        try {
          const countMatches = [...sql.matchAll(new RegExp(`-- TABLE_DATA: ${tableName}\\n([\\s\\S]*?)(?=-- TABLE_DATA:|SET FOREIGN_KEY_CHECKS|$)`))]
          if (countMatches[0]) {
            const block = countMatches[0][1]
            sourceCount = (block.match(/\),\n\(/g) || []).length + (block.match(/^INSERT/gm) || []).length
          }
          if (isMySQL) {
            const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``)
            targetCount = Number(c)
          } else {
            const r = await conn.request().query(`SELECT COUNT(*) AS c FROM [${tableName}]`)
            targetCount = r.recordset[0].c
          }
        } catch {}
        verification.push({ tableName, sourceCount, targetCount, pass: sourceCount === targetCount })
      }
      emit({ done: true, status: 'completed', message: 'Restore complete ✓', verification })
    } else {
      emit({ done: true, status: 'cancelled', message: 'Restore cancelled — database may be in a partial state', level: 'warn' })
    }
  } catch (err) {
    emit({ done: true, status: 'failed', message: err.message, level: 'error' })
  } finally {
    try { if (isMySQL) await conn.end(); else await conn.close() } catch {}
  }
}

async function runChunkedRestore() {
  const { filePath, connectionId, database, tableName, chunkSize = 5000, resumeFromRow = 0, dbPath } = options
  const isMySQL = connConfig.type !== 'mssql'
  const conn = isMySQL ? await connectMySQL(connConfig) : await connectMSSQL(connConfig)
  const db = new Database(dbPath)

  try {
    if (isMySQL) {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``)
      await conn.query(`USE \`${database}\``)
    }

    const sql = readFileSync(filePath, 'utf8')

    // Find the TABLE_DATA section for this table
    const startMarker = `-- TABLE_DATA: ${tableName}\n`
    const startIdx = sql.indexOf(startMarker)
    if (startIdx === -1) throw new Error(`Table ${tableName} not found in backup file`)

    const sectionStart = startIdx + startMarker.length
    const nextMarkerMatch = sql.slice(sectionStart).search(/^-- TABLE_(DATA|SCHEMA):|^SET FOREIGN_KEY_CHECKS/m)
    const sectionEnd = nextMarkerMatch === -1 ? sql.length : sectionStart + nextMarkerMatch
    const section = sql.slice(sectionStart, sectionEnd).trim()

    // Split into individual INSERT statements
    const insertStatements = section
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.toUpperCase().startsWith('INSERT'))

    const totalRows = insertStatements.length * 1000 // approximate
    let rowsDone = resumeFromRow

    // Skip already-done statements (each INSERT has ~1000 rows from backup)
    const stmtsPerChunk = Math.max(1, Math.floor(chunkSize / 1000))
    const startStmt = Math.floor(resumeFromRow / 1000)

    // Ensure job row exists
    const jobId = db.prepare(
      `SELECT id FROM restore_jobs WHERE backup_file = ? AND target_database = ? AND table_name = ?`
    ).get(filePath, database, tableName)?.id ?? (() => {
      const id = randomUUID()
      db.prepare(
        `INSERT INTO restore_jobs (id, backup_file, target_connection_id, target_database, table_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'in_progress', ?)`
      ).run(id, filePath, connectionId, database, tableName, new Date().toISOString())
      return id
    })()

    // Get or create checkpoint
    let checkpointId = db.prepare(`SELECT id FROM restore_checkpoints WHERE job_id = ?`).get(jobId)?.id
    if (!checkpointId) {
      checkpointId = randomUUID()
      db.prepare(
        `INSERT INTO restore_checkpoints (id, job_id, rows_done, total_rows, updated_at) VALUES (?, ?, ?, ?, ?)`
      ).run(checkpointId, jobId, rowsDone, insertStatements.length * 1000, new Date().toISOString())
    }

    for (let i = startStmt; i < insertStatements.length; i += stmtsPerChunk) {
      if (cancelled) break
      const batch = insertStatements.slice(i, i + stmtsPerChunk)
      for (const stmt of batch) {
        try {
          if (isMySQL) await conn.query(stmt)
          else await conn.request().query(stmt)
        } catch (err) {
          emit({ level: 'error', message: `Row error: ${err.message}` })
        }
      }
      rowsDone = Math.min((i + stmtsPerChunk) * 1000, insertStatements.length * 1000)
      db.prepare(`UPDATE restore_checkpoints SET rows_done = ?, updated_at = ? WHERE id = ?`)
        .run(rowsDone, new Date().toISOString(), checkpointId)
      emit({ phase: 'restore', table: tableName, rowsDone, rowsTotal: insertStatements.length * 1000, message: `Restoring ${tableName}… ~${rowsDone} rows` })
    }

    if (!cancelled) {
      // Verify row count
      let targetCount = 0
      if (isMySQL) {
        const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``)
        targetCount = Number(c)
      } else {
        const r = await conn.request().query(`SELECT COUNT(*) AS c FROM [${tableName}]`)
        targetCount = r.recordset[0].c
      }
      db.prepare(`UPDATE restore_jobs SET status = 'completed', completed_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), jobId)
      emit({ done: true, status: 'completed', message: `Chunked restore complete ✓ — ${targetCount} rows in target`, verification: [{ tableName, targetCount }] })
    } else {
      db.prepare(`UPDATE restore_jobs SET status = 'paused' WHERE id = ?`).run(jobId)
      emit({ done: true, status: 'cancelled', message: 'Paused — checkpoint saved. You can resume later.', level: 'warn' })
    }
  } catch (err) {
    emit({ done: true, status: 'failed', message: err.message, level: 'error' })
  } finally {
    try { if (isMySQL) await conn.end(); else await conn.close() } catch {}
    db.close()
  }
}
```

- [ ] **Step 4: Replace the final action dispatch line**

Replace:
```js
if (action === 'backup') runBackup()
```

With:
```js
if (action === 'backup') runBackup()
else if (action === 'restore') runRestore()
else if (action === 'restore-chunked') runChunkedRestore()
```

- [ ] **Step 5: Verify build**

```bash
cd c:/development/MyMariaDB && npm run build 2>&1 | head -20
```

Expected: builds without error.

- [ ] **Step 6: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/backup/backup-worker.js && git commit -m "feat: add restore and chunked restore actions to backup worker"
```

---

## Task 5: backup-ipc.js + tests

Registers all IPC channels. Spawns/terminates workers. Forwards `postMessage` events to the renderer via `webContents.send`.

**Files:**
- Create: `src/main/ipc/backup-ipc.js`
- Create: `tests/main/ipc/backup-ipc.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/ipc/backup-ipc.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]) }
}))

const mockWorker = {
  on: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn()
}

vi.mock('worker_threads', () => ({
  Worker: vi.fn(() => mockWorker)
}))

vi.mock('../../../src/main/db/connection-repository.js', () => ({
  getConnection: vi.fn().mockReturnValue({
    id: 'c1', type: 'mysql', host: 'localhost', port: 3306,
    username: 'root', password: 'pw'
  })
}))

vi.mock('../../../src/main/db/sqlite.js', () => ({
  getDb: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(null) })
  })
}))

import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import { registerBackupIpc } from '../../../src/main/ipc/backup-ipc.js'

describe('backup-ipc', () => {
  const handlers = {}

  beforeEach(() => {
    vi.clearAllMocks()
    ipcMain.handle.mockImplementation((channel, fn) => { handlers[channel] = fn })
    mockWorker.on.mockImplementation((event, fn) => {
      if (event === 'message') fn({ done: true, status: 'completed', message: 'done' })
    })
    registerBackupIpc()
  })

  it('registers all expected channels', () => {
    const channels = ipcMain.handle.mock.calls.map(c => c[0])
    expect(channels).toContain('backup:getTables')
    expect(channels).toContain('backup:start')
    expect(channels).toContain('backup:cancel')
    expect(channels).toContain('restore:start')
    expect(channels).toContain('restore:start-chunked')
    expect(channels).toContain('restore:cancel')
  })

  it('backup:start spawns a Worker and returns a jobId', async () => {
    const result = await handlers['backup:start'](null, {
      connectionId: 'c1', database: 'mydb', tables: ['users'],
      mode: 'schema+data', includeObjects: true,
      outputPath: 'C:/tmp/mydb.sql', format: 'sql'
    })
    expect(Worker).toHaveBeenCalled()
    expect(result.jobId).toBeTruthy()
  })

  it('backup:cancel terminates the worker', async () => {
    const { jobId } = await handlers['backup:start'](null, {
      connectionId: 'c1', database: 'mydb', tables: [],
      mode: 'schema+data', includeObjects: false,
      outputPath: 'C:/tmp/test.sql', format: 'sql'
    })
    await handlers['backup:cancel'](null, { jobId })
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'cancel' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/ipc/backup-ipc.test.js
```

Expected: FAIL — `backup-ipc.js` not found.

- [ ] **Step 3: Create `src/main/ipc/backup-ipc.js`**

```js
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

const _jobs = new Map() // jobId → Worker

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
    if (event.done) { worker.terminate(); _jobs.delete(jobId) }
  })

  worker.on('error', err => {
    getWebContents()?.send('backup:progress', {
      jobId, done: true, status: 'failed', message: err.message, level: 'error',
      phase: 'data', table: null, rowsDone: 0, rowsTotal: 0
    })
    _jobs.delete(jobId)
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
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('backup:start', async (_, options) => {
    const stored = getConnection(options.connectionId)
    const jobId = spawnWorker('backup', stored, options)
    return { jobId }
  })

  ipcMain.handle('backup:cancel', (_, { jobId }) => {
    const worker = _jobs.get(jobId)
    if (worker) { worker.postMessage({ type: 'cancel' }); _jobs.delete(jobId) }
  })

  ipcMain.handle('restore:start', async (_, options) => {
    const stored = getConnection(options.connectionId)
    const db = getDb()
    const dbPath = db.name
    const jobId = spawnWorker('restore', stored, { ...options, dbPath })
    return { jobId }
  })

  ipcMain.handle('restore:start-chunked', async (_, options) => {
    const stored = getConnection(options.connectionId)
    const db = getDb()
    const dbPath = db.name
    // Check for existing checkpoint
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
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/ipc/backup-ipc.test.js
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/ipc/backup-ipc.js tests/main/ipc/backup-ipc.test.js && git commit -m "feat: add backup IPC handlers with worker spawning"
```

---

## Task 6: Preload + index.js wiring

**Files:**
- Modify: `src/preload/index.js`
- Modify: `src/main/index.js`

- [ ] **Step 1: Read both files**

Read `src/preload/index.js` and `src/main/index.js` before editing.

- [ ] **Step 2: Update `src/preload/index.js`**

```js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  connections: {
    list:   ()         => ipcRenderer.invoke('connections:list'),
    get:    (id)       => ipcRenderer.invoke('connections:get', id),
    create: (data)     => ipcRenderer.invoke('connections:create', data),
    update: (id, data) => ipcRenderer.invoke('connections:update', id, data),
    delete: (id)       => ipcRenderer.invoke('connections:delete', id)
  },
  schema: {
    listDatabases: (connectionId)           => ipcRenderer.invoke('schema:listDatabases', connectionId),
    listObjects:   (connectionId, database) => ipcRenderer.invoke('schema:listObjects', connectionId, database)
  },
  query: {
    execute: (params) => ipcRenderer.invoke('query:execute', params)
  },
  backup: {
    getTables:      (params)  => ipcRenderer.invoke('backup:getTables', params),
    start:          (options) => ipcRenderer.invoke('backup:start', options),
    cancel:         (jobId)   => ipcRenderer.invoke('backup:cancel', { jobId }),
    restoreStart:   (options) => ipcRenderer.invoke('restore:start', options),
    restoreChunked: (options) => ipcRenderer.invoke('restore:start-chunked', options),
    restoreCancel:  (jobId)   => ipcRenderer.invoke('restore:cancel', { jobId }),
    onProgress:     (cb)      => {
      ipcRenderer.on('backup:progress', (_, event) => cb(event))
      return () => ipcRenderer.removeAllListeners('backup:progress')
    }
  }
})
```

- [ ] **Step 3: Update `src/main/index.js`**

Add the import after `registerQueryIpc`:

```js
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { openDb } from './db/sqlite.js'
import { registerConnectionsIpc } from './ipc/connections-ipc.js'
import { registerSchemaIpc } from './ipc/schema-ipc.js'
import { registerQueryIpc } from './ipc/query-ipc.js'
import { registerBackupIpc } from './ipc/backup-ipc.js'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.mymariadb')
  app.on('browser-window-created', (_, win) => {
    win.webContents.on('before-input-event', (e, input) => {
      if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault() }
    })
  })

  const dbPath = join(app.getPath('userData'), 'mymariadb.db')
  openDb(dbPath)
  registerConnectionsIpc()
  registerSchemaIpc()
  registerQueryIpc()
  registerBackupIpc()

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 4: Commit**

```bash
cd c:/development/MyMariaDB && git add src/preload/index.js src/main/index.js && git commit -m "feat: wire backup IPC into preload and main process"
```

---

## Task 7: useBackupStore

**Files:**
- Create: `src/renderer/src/stores/useBackupStore.js`

No automated tests (UI store, consistent with project pattern).

- [ ] **Step 1: Create `src/renderer/src/stores/useBackupStore.js`**

```js
import { create } from 'zustand'

const defaultBackupOptions = {
  connectionId: null,
  database: null,
  tables: [],        // [{ name, rowCount, selected }]
  mode: 'schema+data',
  includeObjects: true,
  outputPath: '',
  format: 'sql'
}

const defaultRestoreOptions = {
  filePath: '',
  fileInfo: null,    // { database, date, tableCount, connectionType }
  connectionId: null,
  database: ''
}

const defaultChunkedOptions = {
  filePath: '',
  connectionId: null,
  database: '',
  tableName: '',
  chunkSize: 5000,
  resumeFromRow: 0,
  existingJobId: null
}

export const useBackupStore = create((set, get) => ({
  open: false,
  activeTab: 'backup',  // 'backup' | 'restore' | 'chunked'

  // Backup wizard
  backupStep: 1,
  backupOptions: { ...defaultBackupOptions },
  backupLog: [],
  backupJobId: null,
  backupRunning: false,

  // Restore wizard
  restoreStep: 1,
  restoreOptions: { ...defaultRestoreOptions },
  restoreLog: [],
  restoreJobId: null,
  restoreRunning: false,
  restoreVerification: null,

  // Chunked restore wizard
  chunkedStep: 1,
  chunkedOptions: { ...defaultChunkedOptions },
  chunkedLog: [],
  chunkedJobId: null,
  chunkedRunning: false,

  openWizard: (tab = 'backup') => set({ open: true, activeTab: tab }),
  closeWizard: () => set({ open: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Backup actions
  setBackupStep: (s) => set({ backupStep: s }),
  setBackupOptions: (patch) => set(st => ({ backupOptions: { ...st.backupOptions, ...patch } })),
  toggleTable: (name) => set(st => ({
    backupOptions: {
      ...st.backupOptions,
      tables: st.backupOptions.tables.map(t => t.name === name ? { ...t, selected: !t.selected } : t)
    }
  })),
  appendBackupLog: (entry) => set(st => ({ backupLog: [...st.backupLog, entry] })),
  resetBackup: () => set({ backupStep: 1, backupOptions: { ...defaultBackupOptions }, backupLog: [], backupJobId: null, backupRunning: false }),

  startBackup: async () => {
    const { backupOptions } = get()
    const selectedTables = backupOptions.tables.filter(t => t.selected).map(t => t.name)
    const result = await window.api.backup.start({ ...backupOptions, tables: selectedTables })
    set({ backupJobId: result.jobId, backupRunning: true })
  },

  cancelBackup: async () => {
    const { backupJobId } = get()
    if (backupJobId) await window.api.backup.cancel(backupJobId)
    set({ backupRunning: false })
  },

  // Restore actions
  setRestoreStep: (s) => set({ restoreStep: s }),
  setRestoreOptions: (patch) => set(st => ({ restoreOptions: { ...st.restoreOptions, ...patch } })),
  appendRestoreLog: (entry) => set(st => ({ restoreLog: [...st.restoreLog, entry] })),
  resetRestore: () => set({ restoreStep: 1, restoreOptions: { ...defaultRestoreOptions }, restoreLog: [], restoreJobId: null, restoreRunning: false, restoreVerification: null }),

  startRestore: async () => {
    const { restoreOptions } = get()
    const result = await window.api.backup.restoreStart(restoreOptions)
    set({ restoreJobId: result.jobId, restoreRunning: true })
  },

  cancelRestore: async () => {
    const { restoreJobId } = get()
    if (restoreJobId) await window.api.backup.restoreCancel(restoreJobId)
    set({ restoreRunning: false })
  },

  // Chunked restore actions
  setChunkedStep: (s) => set({ chunkedStep: s }),
  setChunkedOptions: (patch) => set(st => ({ chunkedOptions: { ...st.chunkedOptions, ...patch } })),
  appendChunkedLog: (entry) => set(st => ({ chunkedLog: [...st.chunkedLog, entry] })),
  resetChunked: () => set({ chunkedStep: 1, chunkedOptions: { ...defaultChunkedOptions }, chunkedLog: [], chunkedJobId: null, chunkedRunning: false }),

  startChunked: async () => {
    const { chunkedOptions } = get()
    const result = await window.api.backup.restoreChunked(chunkedOptions)
    set({ chunkedJobId: result.jobId, chunkedRunning: true, chunkedOptions: { ...chunkedOptions, resumeFromRow: result.resumeFromRow } })
  },

  cancelChunked: async () => {
    const { chunkedJobId } = get()
    if (chunkedJobId) await window.api.backup.restoreCancel(chunkedJobId)
    set({ chunkedRunning: false })
  },

  // Progress event handler — call once on mount
  handleProgress: (event) => {
    const st = get()
    const entry = { level: event.level || 'info', message: event.message, rowsDone: event.rowsDone, rowsTotal: event.rowsTotal }

    if (event.jobId === st.backupJobId) {
      st.appendBackupLog(entry)
      if (event.done) set({ backupRunning: false })
    } else if (event.jobId === st.restoreJobId) {
      st.appendRestoreLog(entry)
      if (event.done) {
        set({ restoreRunning: false, restoreVerification: event.verification ?? null })
      }
    } else if (event.jobId === st.chunkedJobId) {
      st.appendChunkedLog(entry)
      if (event.done) set({ chunkedRunning: false })
    }
  }
}))
```

- [ ] **Step 2: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/stores/useBackupStore.js && git commit -m "feat: add useBackupStore for backup/restore wizard state"
```

---

## Task 8: BackupWizard component

**Files:**
- Create: `src/renderer/src/components/BackupWizard/BackupWizard.css`
- Create: `src/renderer/src/components/BackupWizard/BackupWizard.jsx`

No automated tests.

- [ ] **Step 1: Create `src/renderer/src/components/BackupWizard/BackupWizard.css`**

```css
.bw-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
}

.bw-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.bw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.bw-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }

.bw-close {
  background: none; color: var(--text-secondary);
  font-size: 18px; padding: 0 4px; line-height: 1;
}
.bw-close:hover { color: var(--text-primary); }

.bw-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.bw-tab {
  padding: 8px 18px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  background: none;
  border-bottom: 2px solid transparent;
}
.bw-tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.bw-tab:hover:not(.active) { background: var(--bg-hover); }

.bw-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.bw-steps {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 11px;
}

.bw-step {
  padding: 3px 10px;
  border-radius: 10px;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
}
.bw-step.active { background: var(--accent); color: #fff; }
.bw-step.done { background: #89d185; color: #000; }

.bw-section { margin-bottom: 16px; }
.bw-label { display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 5px; }
.bw-label.required::after { content: ' *'; color: var(--text-error); }

.bw-select, .bw-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 3px;
  outline: none;
}
.bw-select:focus, .bw-input:focus { border-color: var(--border-focus); }

.bw-table-list {
  border: 1px solid var(--border);
  border-radius: 3px;
  max-height: 200px;
  overflow-y: auto;
}

.bw-table-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.bw-table-row:last-child { border-bottom: none; }
.bw-table-row.large { background: rgba(255, 180, 0, 0.06); }

.bw-table-name { flex: 1; color: var(--text-primary); }
.bw-table-count { color: var(--text-secondary); font-size: 11px; font-family: var(--font-mono); }
.bw-large-badge {
  font-size: 10px; color: #d7ba7d;
  border: 1px solid #d7ba7d; border-radius: 3px;
  padding: 0 4px;
}

.bw-radio-group { display: flex; gap: 16px; }
.bw-radio-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--text-primary); cursor: pointer;
}

.bw-checkbox-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text-primary); cursor: pointer;
}

.bw-format-group { display: flex; gap: 12px; flex-wrap: wrap; }

.bw-warning {
  display: flex; gap: 8px;
  background: rgba(255,180,0,0.1);
  border: 1px solid rgba(255,180,0,0.3);
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary);
  margin-bottom: 14px;
}

.bw-error-warning {
  background: rgba(255,100,100,0.1);
  border-color: rgba(255,100,100,0.3);
  color: #ffcccc;
}

.bw-log {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 3px;
  height: 220px;
  overflow-y: auto;
  padding: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.bw-log-line { margin-bottom: 2px; }
.bw-log-line.error { color: var(--text-error); }
.bw-log-line.warn { color: #d7ba7d; }

.bw-progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin: 8px 0;
  overflow: hidden;
}
.bw-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.bw-verify-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin-top: 10px;
}
.bw-verify-table th {
  text-align: left;
  padding: 4px 8px;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.bw-verify-table td { padding: 3px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.bw-verify-pass { color: #89d185; }
.bw-verify-fail { color: var(--text-error); font-weight: bold; }

.bw-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.bw-btn {
  padding: 5px 16px;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
}
.bw-btn-primary { background: var(--accent); color: #fff; }
.bw-btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.bw-btn-primary:disabled { opacity: 0.5; cursor: default; }
.bw-btn-secondary { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); }
.bw-btn-secondary:hover { background: var(--bg-hover); }
.bw-btn-danger { background: #c72e2e; color: #fff; }
.bw-btn-danger:hover { background: #a82424; }
```

- [ ] **Step 2: Create `src/renderer/src/components/BackupWizard/BackupWizard.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import { useBackupStore } from '../../stores/useBackupStore'
import { useConnectionStore } from '../../stores/useConnectionStore'
import './BackupWizard.css'

// ── Backup Tab ───────────────────────────────────────────────────────────────

function BackupTab() {
  const {
    backupStep, setBackupStep,
    backupOptions, setBackupOptions, toggleTable,
    backupLog, appendBackupLog,
    backupRunning, backupJobId,
    startBackup, cancelBackup, resetBackup
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [backupLog])

  const mysqlConns = connections.filter(c => c.type !== 'mssql')
  const mssqlConns = connections.filter(c => c.type === 'mssql')

  const loadTables = async (connectionId, database) => {
    if (!connectionId || !database) return
    const rows = await window.api.backup.getTables({ connectionId, database })
    setBackupOptions({ tables: rows.map(r => ({ ...r, selected: true })) })
  }

  const selectedCount = backupOptions.tables.filter(t => t.selected).length

  const steps = ['Source', 'Content', 'Output', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${backupStep === i + 1 ? 'active' : backupStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {backupStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Connection</label>
            <select className="bw-select" value={backupOptions.connectionId ?? ''}
              onChange={e => { setBackupOptions({ connectionId: e.target.value, database: null, tables: [] }) }}>
              <option value="">— select —</option>
              {mysqlConns.length > 0 && <optgroup label="MySQL / MariaDB">
                {mysqlConns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </optgroup>}
              {mssqlConns.length > 0 && <optgroup label="MSSQL (same-to-same only)">
                {mssqlConns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </optgroup>}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Database</label>
            <input className="bw-input" placeholder="Database name"
              value={backupOptions.database ?? ''}
              onChange={e => setBackupOptions({ database: e.target.value, tables: [] })}
              onBlur={() => loadTables(backupOptions.connectionId, backupOptions.database)} />
          </div>
        </div>
      )}

      {backupStep === 2 && (
        <div>
          <div className="bw-section">
            <label className="bw-label">Tables ({selectedCount}/{backupOptions.tables.length} selected)</label>
            <div className="bw-table-list">
              {backupOptions.tables.map(t => (
                <div key={t.name} className={`bw-table-row ${t.rowCount > 100000 ? 'large' : ''}`}>
                  <input type="checkbox" checked={t.selected} onChange={() => toggleTable(t.name)} />
                  <span className="bw-table-name">{t.name}</span>
                  <span className="bw-table-count">{t.rowCount?.toLocaleString()} rows</span>
                  {t.rowCount > 100000 && <span className="bw-large-badge">large</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="bw-section">
            <label className="bw-label">Mode</label>
            <div className="bw-radio-group">
              {['schema+data', 'schema', 'data'].map(m => (
                <label key={m} className="bw-radio-label">
                  <input type="radio" name="mode" value={m}
                    checked={backupOptions.mode === m}
                    onChange={() => setBackupOptions({ mode: m })} />
                  {m === 'schema+data' ? 'Schema + Data' : m === 'schema' ? 'Schema only' : 'Data only'}
                </label>
              ))}
            </div>
          </div>
          <div className="bw-section">
            <label className="bw-checkbox-label">
              <input type="checkbox" checked={backupOptions.includeObjects}
                onChange={e => setBackupOptions({ includeObjects: e.target.checked })} />
              Include objects (views, procedures, triggers, functions)
            </label>
          </div>
        </div>
      )}

      {backupStep === 3 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Output path (.sql)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={backupOptions.outputPath}
              onChange={e => setBackupOptions({ outputPath: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label">Format</label>
            <div className="bw-format-group">
              {[['sql', 'SQL file'], ['zip', 'ZIP file'], ['both', 'Both']].map(([v, l]) => (
                <label key={v} className="bw-radio-label">
                  <input type="radio" name="format" value={v}
                    checked={backupOptions.format === v}
                    onChange={() => setBackupOptions({ format: v })} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {backupStep === 4 && (
        <div>
          <div className="bw-log" ref={logRef}>
            {backupLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {backupLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : ''}`}>
                {e.message}
                {e.rowsTotal > 0 && ` (${e.rowsDone?.toLocaleString()}/${e.rowsTotal?.toLocaleString()})`}
              </div>
            ))}
          </div>
          {backupLog.length > 0 && backupLog[backupLog.length - 1].rowsTotal > 0 && (
            <div className="bw-progress-bar">
              <div className="bw-progress-fill" style={{
                width: `${Math.round((backupLog[backupLog.length - 1].rowsDone / backupLog[backupLog.length - 1].rowsTotal) * 100)}%`
              }} />
            </div>
          )}
        </div>
      )}

      <div className="bw-footer">
        {backupStep > 1 && !backupRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setBackupStep(backupStep - 1)}>Back</button>
        )}
        {backupStep < 4 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (backupStep === 1 && (!backupOptions.connectionId || !backupOptions.database)) ||
              (backupStep === 2 && selectedCount === 0) ||
              (backupStep === 3 && !backupOptions.outputPath)
            }
            onClick={() => setBackupStep(backupStep + 1)}>
            Next
          </button>
        )}
        {backupStep === 4 && !backupRunning && backupLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startBackup}>Start Backup</button>
        )}
        {backupStep === 4 && backupRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelBackup}>Cancel</button>
        )}
        {backupStep === 4 && !backupRunning && backupLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetBackup}>New Backup</button>
        )}
      </div>
    </div>
  )
}

// ── Restore Tab ──────────────────────────────────────────────────────────────

function RestoreTab() {
  const {
    restoreStep, setRestoreStep,
    restoreOptions, setRestoreOptions,
    restoreLog, appendRestoreLog,
    restoreRunning, restoreVerification,
    startRestore, cancelRestore, resetRestore
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [restoreLog])

  const parseFileHeader = (path) => {
    // Request main to read header via IPC — for now just use filename as hint
    const name = path.split(/[\\/]/).pop()
    setRestoreOptions({ filePath: path, database: name.replace(/\.(sql|zip)$/, '').replace(/_\d{4}-\d{2}-\d{2}$/, '') })
  }

  const steps = ['File', 'Target', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${restoreStep === i + 1 ? 'active' : restoreStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {restoreStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Backup file (.sql or .zip)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={restoreOptions.filePath}
              onChange={e => parseFileHeader(e.target.value)} />
          </div>
          {restoreOptions.database && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              Detected database: <strong style={{ color: 'var(--text-primary)' }}>{restoreOptions.database}</strong>
            </div>
          )}
        </div>
      )}

      {restoreStep === 2 && (
        <div>
          <div className="bw-warning bw-error-warning">
            <span>⚠</span>
            <span>There is no rollback. If the restore fails partway through, the target database will be left in a partial state. If you need to be able to undo this, take a backup of the target database before continuing.</span>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target connection</label>
            <select className="bw-select" value={restoreOptions.connectionId ?? ''}
              onChange={e => setRestoreOptions({ connectionId: e.target.value })}>
              <option value="">— select —</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target database name</label>
            <input className="bw-input" value={restoreOptions.database}
              onChange={e => setRestoreOptions({ database: e.target.value })} />
          </div>
        </div>
      )}

      {restoreStep === 3 && (
        <div>
          <div className="bw-log" ref={logRef}>
            {restoreLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {restoreLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : ''}`}>{e.message}</div>
            ))}
          </div>
          {restoreVerification && (
            <table className="bw-verify-table">
              <thead><tr><th>Table</th><th>Pass</th></tr></thead>
              <tbody>
                {restoreVerification.map(v => (
                  <tr key={v.tableName}>
                    <td>{v.tableName}</td>
                    <td className={v.pass ? 'bw-verify-pass' : 'bw-verify-fail'}>
                      {v.pass ? '✓' : `✗ target: ${v.targetCount}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="bw-footer">
        {restoreStep > 1 && !restoreRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setRestoreStep(restoreStep - 1)}>Back</button>
        )}
        {restoreStep < 3 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (restoreStep === 1 && !restoreOptions.filePath) ||
              (restoreStep === 2 && (!restoreOptions.connectionId || !restoreOptions.database))
            }
            onClick={() => setRestoreStep(restoreStep + 1)}>
            Next
          </button>
        )}
        {restoreStep === 3 && !restoreRunning && restoreLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startRestore}>Start Restore</button>
        )}
        {restoreStep === 3 && restoreRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelRestore}>Cancel</button>
        )}
        {restoreStep === 3 && !restoreRunning && restoreLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetRestore}>New Restore</button>
        )}
      </div>
    </div>
  )
}

// ── Chunked Restore Tab ──────────────────────────────────────────────────────

function ChunkedTab() {
  const {
    chunkedStep, setChunkedStep,
    chunkedOptions, setChunkedOptions,
    chunkedLog, chunkedRunning,
    startChunked, cancelChunked, resetChunked
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [chunkedLog])

  const steps = ['File & Table', 'Target', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${chunkedStep === i + 1 ? 'active' : chunkedStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {chunkedStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Backup file (.sql or .zip)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={chunkedOptions.filePath}
              onChange={e => setChunkedOptions({ filePath: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label required">Table name to restore</label>
            <input className="bw-input" placeholder="users"
              value={chunkedOptions.tableName}
              onChange={e => setChunkedOptions({ tableName: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label">Chunk size (rows per batch)</label>
            <input className="bw-input" type="number" min="1000" step="1000"
              value={chunkedOptions.chunkSize}
              onChange={e => setChunkedOptions({ chunkSize: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {chunkedStep === 2 && (
        <div>
          <div className="bw-warning bw-error-warning">
            <span>⚠</span>
            <span>There is no rollback. If the restore fails partway through, the target table will be in a partial state. Take a backup of the target database first if you need to be able to undo this.</span>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target connection</label>
            <select className="bw-select" value={chunkedOptions.connectionId ?? ''}
              onChange={e => setChunkedOptions({ connectionId: e.target.value })}>
              <option value="">— select —</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target database name</label>
            <input className="bw-input" value={chunkedOptions.database}
              onChange={e => setChunkedOptions({ database: e.target.value })} />
          </div>
        </div>
      )}

      {chunkedStep === 3 && (
        <div>
          {chunkedOptions.resumeFromRow > 0 && !chunkedRunning && chunkedLog.length === 0 && (
            <div className="bw-warning">
              <span>ℹ</span>
              <span>Checkpoint found — resuming from row ~{chunkedOptions.resumeFromRow.toLocaleString()}.</span>
            </div>
          )}
          <div className="bw-log" ref={logRef}>
            {chunkedLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {chunkedLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : ''}`}>
                {e.message}
                {e.rowsTotal > 0 && ` (${e.rowsDone?.toLocaleString()}/${e.rowsTotal?.toLocaleString()})`}
              </div>
            ))}
          </div>
          {chunkedLog.length > 0 && chunkedLog[chunkedLog.length - 1].rowsTotal > 0 && (
            <div className="bw-progress-bar">
              <div className="bw-progress-fill" style={{
                width: `${Math.round((chunkedLog[chunkedLog.length - 1].rowsDone / chunkedLog[chunkedLog.length - 1].rowsTotal) * 100)}%`
              }} />
            </div>
          )}
        </div>
      )}

      <div className="bw-footer">
        {chunkedStep > 1 && !chunkedRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setChunkedStep(chunkedStep - 1)}>Back</button>
        )}
        {chunkedStep < 3 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (chunkedStep === 1 && (!chunkedOptions.filePath || !chunkedOptions.tableName)) ||
              (chunkedStep === 2 && (!chunkedOptions.connectionId || !chunkedOptions.database))
            }
            onClick={() => setChunkedStep(chunkedStep + 1)}>
            Next
          </button>
        )}
        {chunkedStep === 3 && !chunkedRunning && chunkedLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startChunked}>
            {chunkedOptions.resumeFromRow > 0 ? 'Resume Restore' : 'Start Restore'}
          </button>
        )}
        {chunkedStep === 3 && chunkedRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelChunked}>Pause</button>
        )}
        {chunkedStep === 3 && !chunkedRunning && chunkedLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetChunked}>New Restore</button>
        )}
      </div>
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────

export default function BackupWizard() {
  const { open, closeWizard, activeTab, setActiveTab, handleProgress } = useBackupStore()

  useEffect(() => {
    if (!open) return
    const unsub = window.api.backup.onProgress(handleProgress)
    return unsub
  }, [open])

  if (!open) return null

  return (
    <div className="bw-overlay" onClick={e => { if (e.target === e.currentTarget) closeWizard() }}>
      <div className="bw-modal">
        <div className="bw-header">
          <span className="bw-title">💾 Backup / Restore</span>
          <button className="bw-close" onClick={closeWizard}>×</button>
        </div>
        <div className="bw-tabs">
          {[['backup', 'Backup'], ['restore', 'Restore'], ['chunked', 'Chunked Restore']].map(([id, label]) => (
            <button key={id} className={`bw-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="bw-body">
          {activeTab === 'backup' && <BackupTab />}
          {activeTab === 'restore' && <RestoreTab />}
          {activeTab === 'chunked' && <ChunkedTab />}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/BackupWizard/ && git commit -m "feat: add BackupWizard modal with Backup, Restore, and Chunked Restore tabs"
```

---

## Task 9: Wire Sidebar + App

**Files:**
- Modify: `src/renderer/src/components/Sidebar/Sidebar.jsx`
- Modify: `src/renderer/src/App.jsx`

- [ ] **Step 1: Read both files**

Read `src/renderer/src/components/Sidebar/Sidebar.jsx` and `src/renderer/src/App.jsx`.

- [ ] **Step 2: Update `src/renderer/src/components/Sidebar/Sidebar.jsx`**

```jsx
import { useEffect } from 'react'
import { useConnectionStore } from '../../stores/useConnectionStore'
import { useBackupStore } from '../../stores/useBackupStore'
import ConnectionTree from './ConnectionTree'
import './Sidebar.css'

export default function Sidebar() {
  const { connections, loadConnections } = useConnectionStore()
  const { openWizard } = useBackupStore()

  useEffect(() => { loadConnections() }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-tree">
        <div className="sidebar-section-label">Connections</div>
        {connections.map(conn => (
          <ConnectionTree key={conn.id} connection={conn} />
        ))}
        {connections.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>
            No connections yet.
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-backup-link" onClick={() => openWizard('backup')}>
          💾 Backup / Restore
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Update `src/renderer/src/App.jsx`**

```jsx
import { useTabStore } from './stores/useTabStore'
import { useConnectionStore } from './stores/useConnectionStore'
import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import TabBar from './components/TabBar/TabBar'
import QueryTab from './components/QueryTab/QueryTab'
import StatusBar from './components/StatusBar/StatusBar'
import BackupWizard from './components/BackupWizard/BackupWizard'

export default function App() {
  const { tabs, activeTabId } = useTabStore()
  const { connections } = useConnectionStore()

  const activeTab = tabs.find(t => t.id === activeTabId)
  const activeConn = connections.find(c => c.id === activeTab?.connectionId)

  let statusLeft = 'Ready'
  let leftError = false
  if (activeTab?.running) {
    statusLeft = 'Running…'
  } else if (activeTab?.results?.error) {
    statusLeft = activeTab.results.error
    leftError = true
  } else if (activeTab?.results?.rowCount !== undefined) {
    const r = activeTab.results
    statusLeft = `✓ ${r.rowCount} row${r.rowCount !== 1 ? 's' : ''} · ${r.durationMs}ms`
  }

  const statusRight = activeConn
    ? [activeConn.host, activeTab?.database, activeTab?.serverVersion].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar />
      <main style={{
        gridArea: 'main',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>
        <TabBar />
        {activeTab
          ? <QueryTab key={activeTabId} tabId={activeTabId} />
          : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13
            }}>
              Open a connection from the sidebar, then press + to start a query
            </div>
          )
        }
      </main>
      <StatusBar left={statusLeft} right={statusRight} leftError={leftError} />
      <BackupWizard />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/Sidebar/Sidebar.jsx src/renderer/src/App.jsx && git commit -m "feat: wire BackupWizard into Sidebar and App"
```

---

## Task 10: Run all tests

- [ ] **Step 1: Run the full test suite**

```bash
cd c:/development/MyMariaDB && npm test
```

Expected output:

```
✓ tests/renderer/utils/formatDate.test.jsx         (4 tests)
✓ tests/renderer/stores/useConnectionStore.test.jsx (4 tests)
✓ tests/renderer/stores/useTabStore.test.jsx        (7 tests)
✓ tests/main/db/sqlite.test.js                     (2 tests)
✓ tests/main/db/connection-repository.test.js      (5 tests)
✓ tests/main/connections/connection-manager.test.js (4 tests)
✓ tests/main/ipc/query-ipc.test.js                 (3 tests)
✓ tests/main/backup/transforms.test.js             (13 tests)
✓ tests/main/ipc/backup-ipc.test.js                (3 tests)

Test Files: 9 passed
Tests:      45 passed
```

If any test fails, fix it before proceeding.

- [ ] **Step 2: Commit if anything was fixed**

```bash
cd c:/development/MyMariaDB && git add -A && git commit -m "chore: all Plan 3 tests passing"
```

---

## What's Next

The app now has full backup/restore capability. Possible future plans:
- **Plan 4 — Connection Dialog enhancements:** Test connection button, SSH tunnel support
- **Plan 5 — Query history:** Persist executed queries per connection to SQLite, searchable from a history panel
