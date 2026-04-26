# MyMariaDB — Design Spec
**Date:** 2026-04-26

---

## 1. Purpose

MyMariaDB is an open-source Electron desktop application for Windows 11 that lets developers connect to MySQL, MariaDB, and MSSQL databases, run SQL queries, and — its core differentiator — backup and restore MySQL 8.0.42 databases in a format compatible with both MariaDB 11.8.6 and MySQL 8.0.42 targets. Restore progress is checkpointed so operations can resume after interruption.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron (Windows 11) |
| UI framework | React |
| State management | Zustand |
| Query editor | Monaco Editor (VS Code engine) |
| DB drivers | `mysql2` (MySQL + MariaDB), `mssql` (SQL Server) |
| Local storage | SQLite3 (via `better-sqlite3`) |
| Backup worker | Node.js worker thread |
| Password storage | Electron `safeStorage` (Windows Credential Manager) |

---

## 3. Architecture

The app follows a strict Electron main/renderer split. The renderer never touches DB drivers directly — all database calls go through IPC.

```
┌─────────────────────────────────┐        ┌──────────────────────────────────────┐
│       RENDERER PROCESS          │        │          MAIN PROCESS                │
│                                 │        │                                      │
│  React Components               │        │  IPC Handlers                        │
│  ├── Sidebar                    │ IPC    │  ├── connections-ipc.js              │
│  ├── TabBar                     │◄──────►│  ├── query-ipc.js                   │
│  ├── QueryTab (Monaco + Grid)   │        │  └── backup-ipc.js                  │
│  └── BackupWizard               │        │                                      │
│                                 │        │  DB Drivers                          │
│  Zustand Stores                 │        │  ├── mysql2 (MySQL + MariaDB)        │
│  ├── useConnectionStore         │        │  └── mssql (SQL Server)              │
│  ├── useTabStore                │        │                                      │
│  └── useBackupStore             │        │  SQLite3 (local storage)             │
│                                 │        │  ├── saved connections               │
│  contextBridge (window.api)     │        │  └── restore job checkpoints         │
└─────────────────────────────────┘        │                                      │
                                           │  Worker Thread                       │
                                           │  └── backup-worker.js                │
                                           └──────────────────────────────────────┘
```

**Key constraints:**
- `contextBridge` exposes a typed `window.api` — no direct Node access from renderer.
- The backup/restore engine runs in a Node worker thread so large operations never freeze the UI.
- IPC is split into three domain modules; each owns its channels and nothing else.

---

## 4. UI Structure

### 4.1 Layout — Classic Split

```
┌─────────────────────────────────────────────────────────────┐
│  Title bar: MyMariaDB          [+ New Connection] [⚙ Settings] │
├──────────────┬──────────────────────────────────────────────┤
│              │  [Query 1 ●] [Query 2] [📋 users] [+]        │
│   Sidebar    ├──────────────────────────────────────────────┤
│              │  SQL EDITOR (Monaco)      [▶ Run F5] [Format] │
│  Object      │  line numbers | syntax highlighting | vs-dark │
│  Explorer    ├──────────────────────────────────────────────┤
│              │  RESULTS           [☑ Limit 50 rows] [⬇ CSV] │
│  [💾 Backup] │  read-only grid, alternating rows, sortable  │
├──────────────┴──────────────────────────────────────────────┤
│  Status bar: ✓ N rows · Xms  |  host · database · version  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Sidebar

- Tree structure: connections → databases → Tables / Views / Stored Procs / Triggers
- Connection status indicator: 🟢 connected, 🔴 error, 🟡 idle
- Right-click context menu on tables: **Preview data** (opens table tab), **New Query Tab**
- Backup / Restore link pinned to the bottom of the sidebar

### 4.3 Query Tabs

- Multiple tabs open simultaneously; each tab owns its own Monaco editor instance and results panel
- Tab title defaults to "Query N" (editable by double-clicking)
- Table preview tabs (opened via sidebar right-click) auto-execute `SELECT * FROM <table>` with the 50-row limit applied
- Editor header shows active context: `database @ connection`

### 4.4 Monaco Editor Configuration

```js
{
  language: 'sql',
  theme: 'vs-dark',
  lineNumbers: 'on',
  minimap: { enabled: false },
  wordWrap: 'off',
}
```

F5 keybinding executes the current query.

### 4.5 Results Grid

- Read-only; no inline editing in v1
- Alternating row background colors
- **"Limit 50 rows" checkbox — ticked by default**; toggling does not auto-re-run — the user must press Run (F5) again to apply the change
- Export to CSV button
- Column headers are sortable (client-side sort, no re-query)

### 4.6 Status Bar

- Left: query result summary (row count, execution time) or error message in red
- Right: active connection host · database name · server version

---

## 5. Database Support

| Database | Driver | Version target | Backup support |
|---|---|---|---|
| MySQL | `mysql2` | 8.0.42 | Full (schema + data + objects) |
| MariaDB | `mysql2` | 11.8.6 | Full (schema + data + objects) |
| MSSQL | `mssql` | Any | Full (schema + data + objects + functions) |

**Authentication:** SQL Server login (username + password) only in v1. Windows Authentication not supported in v1.

---

## 6. Backup Engine

### 6.1 Backup Wizard (4 steps)

**Step 1 — Source**
- Select source connection
- Select database
- Select target type: MySQL → MariaDB / MySQL → MySQL / MSSQL → MSSQL

**Step 2 — Objects & Content**

Content mode (radio, required):
- `Schema only` — DDL only, no data, no row-count verification
- `Data only` — INSERT statements only, no DDL or objects
- `Schema + Data` *(default)* — full backup including objects

Objects to include (checkboxes, all ticked by default):
- All tables
- Views
- Stored procedures
- Triggers
- Functions *(MSSQL only)*

**Step 3 — Output**
- Format: `.sql only` / `.zip only` / `.sql + .zip` *(default)*
- Output folder picker
- Filename: auto-generated with timestamp, e.g. `mydb_2026-04-26T143000.sql`

**Step 4 — Run**
- Progress bar per object
- Live log output
- Cancel button (stops after the current object completes)
- "Open output folder" button on completion

### 6.2 Backup Generation (worker thread)

Phases executed in order. Phases are skipped based on content mode.

| Phase | Skipped when |
|---|---|
| ① Schema — CREATE TABLE statements | content mode = `data` |
| ② Data — batched INSERT (500 rows/chunk) | content mode = `schema` |
| ③ Objects — Views → Stored Procs → Triggers (dependency order), DELIMITER ;; blocks | content mode = `data` |
| ④ Compatibility transforms | never skipped |

**MySQL 8.0.42 → MariaDB 11.8.6 compatibility transforms:**
- Rewrite `utf8mb4_0900_ai_ci` → `utf8mb4_general_ci`
- Remove `VISIBLE` keyword from index definitions
- Rewrite `GENERATED ALWAYS AS` expressions where syntax differs
- Strip unsupported `ROW_FORMAT` values

---

## 7. Restore Engine

### 7.1 Restore Wizard

- Select backup file (.sql or .zip); if .zip is selected the app extracts the .sql file to a temp directory before restore begins
- Select target connection + database
- If an incomplete restore job exists for this file+target: **Resume from last checkpoint is pre-selected by default**
- Option to start fresh (clears existing checkpoints for this job)

### 7.2 Checkpointing

Every restorable object is one checkpoint entry in `restore_checkpoints`. Before executing each block the worker checks if `status = 'done'` — if so, the block is skipped. This means:

- A restore interrupted at any point (crash, cancel, network drop) can resume from exactly where it stopped
- No object is ever restored twice in a resume run
- Row counts for verified tables are stored in the checkpoint row so source does not need to be re-queried after a resume

### 7.3 Row Count Verification

Runs automatically after a successful `Schema + Data` or `Data only` restore. Skipped entirely for `Schema only` restores.

For each table: `SELECT COUNT(*) FROM <table>` on source and target. Results displayed in a pass/fail grid. A mismatch is flagged in red but does not block the user — the full results are shown so they can decide how to proceed.

---

## 8. SQLite Data Model

All primary keys are UUID v4, generated with Node's built-in `crypto.randomUUID()`. All foreign keys enforced with `ON DELETE CASCADE`.

**Column type convention:** `VARCHAR(255)` for short string fields (names, types, statuses, identifiers). `TEXT` only where content can be large (file paths, encrypted blobs). SQLite stores both identically internally — this is enforced as a code convention for clarity and consistency with the MySQL/MariaDB databases the app manages.

**Date format convention:** Dates are stored in SQLite as ISO 8601 strings (e.g. `2026-04-26T14:30:00.000Z`). In the UI, dates are always displayed as `DD MMM YYYY` (e.g. `26 Apr 2026`). A shared `formatDate(isoString)` utility (added in Plan 2) handles this conversion.

### `connections`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(255) PK | UUID v4 |
| `name` | VARCHAR(255) | Display label e.g. "prod-mysql" |
| `type` | VARCHAR(20) | `'mysql'` \| `'mariadb'` \| `'mssql'` |
| `host` | VARCHAR(255) | |
| `port` | INTEGER | 3306 default for MySQL/MariaDB, 1433 for MSSQL |
| `database` | VARCHAR(255) | Default database |
| `username` | VARCHAR(255) | |
| `password` | TEXT | Encrypted via Electron `safeStorage` — blob can exceed 255 chars |
| `created_at` | VARCHAR(30) | ISO 8601 |

### `restore_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(255) PK | UUID v4 |
| `backup_file` | TEXT | Absolute path to .sql file — paths can be long |
| `target_connection_id` | VARCHAR(255) FK | → `connections.id` |
| `target_database` | VARCHAR(255) | Destination database name |
| `content_mode` | VARCHAR(20) | `'schema'` \| `'data'` \| `'both'` |
| `status` | VARCHAR(20) | `'in_progress'` \| `'done'` \| `'failed'` |
| `created_at` | VARCHAR(30) | ISO 8601 |
| `completed_at` | VARCHAR(30) | NULL until finished |

### `restore_checkpoints`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(255) PK | UUID v4 |
| `job_id` | VARCHAR(255) FK | → `restore_jobs.id` |
| `object_type` | VARCHAR(50) | `'table_schema'` \| `'table_data'` \| `'view'` \| `'procedure'` \| `'trigger'` \| `'function'` |
| `object_name` | VARCHAR(255) | e.g. `"users"` |
| `status` | VARCHAR(20) | `'pending'` \| `'done'` \| `'failed'` |
| `row_count_source` | INTEGER | NULL for non-table objects or schema-only jobs |
| `row_count_target` | INTEGER | NULL until verification runs |
| `completed_at` | VARCHAR(30) | NULL until done |

---

## 9. Error Handling

- Connection errors displayed in status bar and logged to results panel
- Query errors shown in results panel with full error message from driver
- Backup errors logged to the live log in the wizard Run step; the job status is set to `failed` in SQLite
- Restore errors set the checkpoint to `failed`; the job pauses and shows the error with a "Skip & Continue" or "Abort" option
- All unhandled main process errors caught and sent to renderer via IPC for display

---

## 10. Out of Scope for v1

- Windows Authentication for MSSQL
- Inline data editing in the results grid
- Query history / saved queries
- Dark/light theme toggle (ships dark only)
- Database creation / deletion UI
- User / permission management
- Export formats beyond CSV
