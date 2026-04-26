# MyMariaDB — Plan 3: Backup & Restore Design

**Date:** 2026-04-26

---

## 1. Goal

Add a backup wizard and restore wizard to MyMariaDB. MySQL 8.0.42 backups must be restorable to both MariaDB 11.8.6 and MySQL 8.0.42 — compatibility transforms are applied inline during backup generation. MSSQL backup/restore is same-to-same with no transforms. All heavy work runs in a Node.js worker thread so the UI never freezes.

---

## 2. Architecture

```
Renderer                          Main Process
─────────────────────────         ─────────────────────────────────────────
BackupWizard component            backup-ipc.js
useBackupStore (Zustand)   IPC    backup-worker.js  (worker thread)
window.api.backup        ◄────►   transforms.js     (pure functions)
                                  SQLite migrations  (restore_jobs, restore_checkpoints)
```

**New files:**
- `src/main/ipc/backup-ipc.js` — IPC handler registration
- `src/main/backup/backup-worker.js` — worker thread, handles backup and restore
- `src/main/backup/transforms.js` — MySQL→MariaDB SQL compatibility transforms
- `src/main/db/migrations/003_restore_jobs.sql` — SQLite migration
- `src/renderer/src/stores/useBackupStore.js` — Zustand wizard state
- `src/renderer/src/components/BackupWizard/BackupWizard.jsx` + `.css`

**Modified files:**
- `src/preload/index.js` — add `window.api.backup` namespace
- `src/main/index.js` — register `registerBackupIpc()`
- `src/renderer/src/App.jsx` — render `<BackupWizard />` when open
- `src/renderer/src/components/Sidebar/Sidebar.jsx` — add 💾 button to sidebar footer

---

## 3. IPC Channels

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `backup:getTables` | renderer → main | `{ connectionId, database }` | `[{ name, rowCount }]` |
| `backup:start` | renderer → main | `BackupOptions` | `{ jobId }` |
| `backup:cancel` | renderer → main | `{ jobId }` | void |
| `restore:start` | renderer → main | `RestoreOptions` | `{ jobId }` |
| `restore:start-chunked` | renderer → main | `ChunkedRestoreOptions` | `{ jobId }` |
| `restore:cancel` | renderer → main | `{ jobId }` | void |
| `backup:progress` | main → renderer | `ProgressEvent` | — (push) |

Progress is pushed via `webContents.send('backup:progress', event)` — not a return value — because it streams throughout the operation.

**ProgressEvent shape:**
```js
{
  jobId: string,
  phase: 'schema' | 'data' | 'objects' | 'zip' | 'restore' | 'verify',
  table: string | null,
  rowsDone: number,
  rowsTotal: number,
  message: string,        // human-readable log line
  level: 'info' | 'warn' | 'error',
  done: boolean,
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
}
```

**BackupOptions:**
```js
{
  connectionId: string,
  database: string,
  tables: string[],           // selected table names
  mode: 'schema+data' | 'schema' | 'data',
  includeObjects: boolean,
  outputPath: string,         // absolute path, .sql extension
  format: 'sql' | 'zip' | 'both'
}
```

**RestoreOptions:**
```js
{
  filePath: string,           // absolute path to .sql or .zip
  connectionId: string,
  database: string
}
```

**ChunkedRestoreOptions:**
```js
{
  filePath: string,
  connectionId: string,
  database: string,
  tableName: string,
  chunkSize: number,          // default 5000
  resumeFromRow: number       // 0 for fresh start
}
```

---

## 4. Backup Flow

### 4.1 Wizard Steps

**Step 1 — Source**
- Dropdown of saved connections (MySQL and MariaDB only shown; MSSQL shown separately with a note that it backs up to MSSQL-only format)
- Dropdown of databases on the selected connection

**Step 2 — Content**
- Table list with row count next to each table name, all ticked by default
- Tables with > 100,000 rows are highlighted in amber with a note: "Large table — consider excluding and using chunked restore separately"
- `Schema + Data` / `Schema only` / `Data only` radio buttons (default: Schema + Data)
- `Include objects (views, procedures, triggers, functions)` checkbox (default: checked)

**Step 3 — Output**
- File path picker, default: `{database}_{YYYY-MM-DD}.sql` in user's Documents folder
- Format: `SQL file` / `ZIP file` / `Both` (default: SQL file)

**Step 4 — Run**
- Live log panel (scrolling, monospace)
- Progress bar per table during data phase
- Cancel button (stops after current table batch, deletes partial output file)
- On completion: summary card showing file size, duration, table count, any warnings
- "Open folder" button

### 4.2 Worker Phases

Executed in order. Phases skipped based on `mode` and `includeObjects`:

1. **Header** — Standard comment block followed by session setup:
   ```sql
   -- MyMariaDB Backup
   -- Source: {database}
   -- Date: {YYYY-MM-DD HH:MM:SS}
   -- Tables: {count}
   -- Connection type: mysql|mariadb|mssql
   SET NAMES utf8mb4;
   SET FOREIGN_KEY_CHECKS=0;
   SET UNIQUE_CHECKS=0;
   ```
2. **Schema** — For each selected table: `SHOW CREATE TABLE`, apply transforms, write `DROP TABLE IF EXISTS` + `CREATE TABLE`. Preceded by `-- TABLE_SCHEMA: {name}`
3. **Data** — For each selected table with data: `SELECT * FROM table LIMIT 1000 OFFSET n` batched until all rows written as multi-row INSERTs. Data section preceded by `-- TABLE_DATA: {name}` marker so chunked restore can seek directly to it
4. **Objects** — Views (`SHOW CREATE VIEW`), procedures, functions, triggers (`SHOW CREATE PROCEDURE` etc.), transforms applied to each
5. **Footer** — `SET FOREIGN_KEY_CHECKS=1; SET UNIQUE_CHECKS=1;`
6. **Zip** — If format is `zip` or `both`, compress the .sql using Node's `zlib` (gzip) into a `.zip` alongside it; delete the .sql if format is `zip` only

The worker sends a `ProgressEvent` after every table and after every 1,000-row batch.

---

## 5. MySQL → MariaDB Compatibility Transforms

Applied to all DDL strings before writing to the output file. Pure string/regex operations in `transforms.js`.

| Transform | Input | Output |
|---|---|---|
| Collation: 0900 | `utf8mb4_0900_ai_ci` | `utf8mb4_general_ci` |
| Collation: 0900 case-sensitive | `utf8mb4_0900_as_cs` | `utf8mb4_bin` |
| Collation: 0900 accent-sensitive | `utf8mb4_0900_as_ci` | `utf8mb4_unicode_ci` |
| INVISIBLE columns | `col INT INVISIBLE` | `col INT` |
| Version-gated comments | `/*!80023 ... */` | `` (removed) |
| Expression defaults | `DEFAULT (expr)` | `DEFAULT expr` (unwrap parens for simple literals) |

Each transform is a separate exported function so it can be unit tested independently.

---

## 6. Restore Flow

### 6.1 Standard Restore Wizard (3 steps)

**Step 1 — File**
- File picker accepting `.sql` and `.zip`
- If `.zip`: extracted to OS temp directory before proceeding
- Reads first 20 lines of the .sql and parses the standard header comments (see Section 4.2 phase 1) to display: source database name, export date, table count, connection type

**Step 2 — Target**
- Dropdown of saved connections
- Text input for target database name
- Warning if database already exists: "This database already has data. Restoring will add or overwrite objects."
- **⚠ No-rollback banner (always shown):** "There is no rollback. If the restore fails partway through, the target database will be left in a partial state. If you need to be able to undo this, take a backup of the target database before continuing."

**Step 3 — Run**
- Same live log panel as backup
- Cancel button (stops after current statement; database left in partial state, shown clearly)
- On completion: row count verification table — source count vs restored count per table, pass ✓ or fail ✗ in red; mismatches do not block the user

### 6.2 Chunked Single-Table Restore

A separate entry point accessible from the restore wizard ("Restore single large table in chunks").

**Flow:**
1. User picks a `.sql` backup file and selects one table from it
2. If a checkpoint exists for this file + target + table, "Resume from row N" is pre-selected; user can choose fresh start
3. Worker extracts only that table's INSERT rows from the file
4. Inserts in batches of 5,000 rows (`chunkSize`)
5. After each batch: upserts a checkpoint row in SQLite (`restore_checkpoints`) with `rows_done`
6. Progress shown as `Restoring users… 45,000 / 210,000 rows`
7. On completion: row count verification for that table only

**Checkpoint SQLite tables** (migration `003_restore_jobs.sql`):

```sql
CREATE TABLE IF NOT EXISTS restore_jobs (
  id VARCHAR(255) PRIMARY KEY,
  backup_file TEXT NOT NULL,
  target_connection_id VARCHAR(255) NOT NULL,
  target_database VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at VARCHAR(30) NOT NULL,
  completed_at VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS restore_checkpoints (
  id VARCHAR(255) PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL REFERENCES restore_jobs(id),
  rows_done INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  updated_at VARCHAR(30) NOT NULL
);
```

---

## 7. Error Handling

| Scenario | Behaviour |
|---|---|
| Per-table backup error | Logged in red, continue with next table, job marked `completed_with_errors` |
| Restore statement error | Log shown; user chooses Skip & Continue or Abort |
| Abort during restore | Database left in partial state; clear warning shown: "The database is in a partial state. Restore a backup to recover." |
| Cancel during backup | Partial output file deleted; temp zip removed |
| Cancel during chunked restore | Checkpoint preserved; user can resume later |
| Worker crash | Main process catches `worker.on('error')`, pushes a fatal error event to renderer |

---

## 8. Sidebar Entry Point

A `💾 Backup / Restore` button is pinned to the bottom of the sidebar. Clicking it opens the `BackupWizard` component as a modal overlay. The modal has tabs: **Backup**, **Restore**, **Chunked Restore**.

---

## 9. Testing

- `tests/main/backup/transforms.test.js` — unit tests for every transform function (before/after SQL strings)
- `tests/main/ipc/backup-ipc.test.js` — IPC handler tests with mocked worker
- No tests for wizard UI components (consistent with Plans 1 & 2)

Expected test count after Plan 3: **~42 tests** (29 existing + ~13 new)
