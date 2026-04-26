# MyMariaDB — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstraps the Electron app with a working connection manager — users can add/edit/delete MySQL, MariaDB, and MSSQL connections, see them in a sidebar tree, and expand databases and tables.

**Architecture:** Electron main/renderer split with contextBridge IPC. Main process owns all DB drivers and SQLite via domain IPC modules. Renderer is React + Zustand, never touches Node APIs directly.

**Tech Stack:** Electron, electron-vite, React 18, Zustand, better-sqlite3, mysql2, mssql, Vitest

---

## File Map

```
c:\development\MyMariaDB\
├── package.json
├── electron.vite.config.mjs
├── .gitignore
├── vitest.config.mjs
├── resources/                          (Electron resources, empty for now)
├── src/
│   ├── main/
│   │   ├── index.js                    entry: creates window, registers all IPC
│   │   ├── db/
│   │   │   ├── sqlite.js               opens DB, runs migrations
│   │   │   ├── connection-repository.js CRUD for connections table
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql     creates all 3 tables
│   │   ├── ipc/
│   │   │   ├── connections-ipc.js      IPC handlers: list/create/update/delete/test
│   │   │   └── schema-ipc.js           IPC handlers: listDatabases, listObjects
│   │   └── connections/
│   │       └── connection-manager.js   opens/caches/closes mysql2 + mssql connections
│   ├── preload/
│   │   └── index.js                    contextBridge: exposes window.api
│   └── renderer/
│       └── src/
│           ├── main.jsx                React entry
│           ├── App.jsx                 root layout (TitleBar + Sidebar + Main + StatusBar)
│           ├── index.css               global VS Code dark theme CSS variables
│           ├── stores/
│           │   └── useConnectionStore.js Zustand: connections list, active connection
│           └── components/
│               ├── TitleBar/
│               │   └── TitleBar.jsx    app name + New Connection button
│               ├── Sidebar/
│               │   ├── Sidebar.jsx     sidebar shell + Backup link at bottom
│               │   ├── ConnectionTree.jsx tree: connections → databases → tables/objects
│               │   └── Sidebar.css
│               ├── ConnectionDialog/
│               │   ├── ConnectionDialog.jsx add/edit connection modal form
│               │   └── ConnectionDialog.css
│               └── StatusBar/
│                   └── StatusBar.jsx   bottom bar: connection + db + version info
└── tests/
    ├── main/
    │   ├── db/
    │   │   ├── sqlite.test.js
    │   │   └── connection-repository.test.js
    │   └── connections/
    │       └── connection-manager.test.js
    └── renderer/
        └── stores/
            └── useConnectionStore.test.js
```

---

## Task 1: Initialize project and git

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron.vite.config.mjs`

- [ ] **Step 1: Initialize npm and git**

```bash
cd c:/development/MyMariaDB
git init
npm init -y
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install --save-dev electron electron-vite @vitejs/plugin-react vite vitest @testing-library/react @testing-library/jest-dom jsdom
npm install react react-dom zustand @monaco-editor/react mysql2 mssql better-sqlite3 archiver adm-zip
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
dist-electron/
out/
.superpowers/
*.db
```

- [ ] **Step 4: Replace `package.json` with this content**

```json
{
  "name": "mymariadb",
  "version": "0.1.0",
  "description": "Open-source database management tool",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "adm-zip": "^0.5.16",
    "archiver": "^7.0.1",
    "better-sqlite3": "^11.0.0",
    "mssql": "^11.0.1",
    "mysql2": "^3.11.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 5: Create `electron.vite.config.mjs`**

```js
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
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

- [ ] **Step 6: Create `vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          include: ['tests/main/**/*.test.js'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'renderer',
          include: ['tests/renderer/**/*.test.jsx'],
          environment: 'jsdom',
          setupFiles: ['tests/renderer/setup.js']
        }
      }
    ]
  }
})
```

- [ ] **Step 7: Create `tests/renderer/setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Create required directories**

```bash
mkdir -p src/main/db/migrations src/main/ipc src/main/connections
mkdir -p src/preload
mkdir -p src/renderer/src/stores
mkdir -p src/renderer/src/components/TitleBar
mkdir -p src/renderer/src/components/Sidebar
mkdir -p src/renderer/src/components/ConnectionDialog
mkdir -p src/renderer/src/components/StatusBar
mkdir -p tests/main/db tests/main/connections tests/renderer/stores
mkdir -p resources
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "chore: initialize electron-vite project with dependencies"
```

---

## Task 2: Electron main entry + renderer HTML

**Files:**
- Create: `src/main/index.js`
- Create: `src/renderer/src/main.jsx`
- Create: `src/renderer/index.html`

- [ ] **Step 1: Create `src/renderer/index.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MyMariaDB</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/main/index.js`**

```js
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

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
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mymariadb')
  app.on('browser-window-created', (_, window) => optimizer.watchShortcuts(window))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 3: Install missing electron-toolkit dep**

```bash
npm install @electron-toolkit/utils
```

- [ ] **Step 4: Create `src/renderer/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Create placeholder `src/renderer/src/App.jsx`**

```jsx
export default function App() {
  return <div className="app-shell">MyMariaDB loading...</div>
}
```

- [ ] **Step 6: Create `src/preload/index.js` (stub)**

```js
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 7: Verify app launches**

```bash
npm run dev
```

Expected: Electron window opens showing "MyMariaDB loading..." with no console errors.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: add electron main process entry and renderer shell"
```

---

## Task 3: Global VS Code dark theme CSS

**Files:**
- Create: `src/renderer/src/index.css`

- [ ] **Step 1: Create `src/renderer/src/index.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-base: #1e1e1e;
  --bg-sidebar: #252526;
  --bg-panel: #252526;
  --bg-editor: #1e1e1e;
  --bg-input: #3c3c3c;
  --bg-hover: #2a2d2e;
  --bg-selected: #094771;
  --bg-row-alt: #252526;

  --border: #3c3c3c;
  --border-focus: #007acc;

  --text-primary: #cccccc;
  --text-secondary: #858585;
  --text-accent: #9cdcfe;
  --text-keyword: #569cd6;
  --text-string: #ce9178;
  --text-number: #b5cea8;
  --text-type: #4ec9b0;
  --text-error: #f48771;
  --text-success: #89d185;

  --accent: #007acc;
  --accent-hover: #1a8ad4;

  --status-bar-bg: #007acc;
  --status-bar-text: #ffffff;

  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Consolas', 'Courier New', monospace;

  --sidebar-width: 220px;
  --titlebar-height: 36px;
  --statusbar-height: 24px;
}

html, body, #root {
  height: 100%;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  overflow: hidden;
}

.app-shell {
  display: grid;
  grid-template-rows: var(--titlebar-height) 1fr var(--statusbar-height);
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-areas:
    "titlebar titlebar"
    "sidebar  main"
    "statusbar statusbar";
  height: 100vh;
  width: 100vw;
}

button {
  cursor: pointer;
  border: none;
  font-family: var(--font-ui);
  font-size: 12px;
}

input, select {
  font-family: var(--font-ui);
  font-size: 13px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 4px 8px;
  outline: none;
}

input:focus, select:focus {
  border-color: var(--border-focus);
}
```

- [ ] **Step 2: Update `src/renderer/src/App.jsx` to use grid layout**

```jsx
export default function App() {
  return (
    <div className="app-shell">
      <div style={{ gridArea: 'titlebar', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        MyMariaDB
      </div>
      <div style={{ gridArea: 'sidebar', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }} />
      <div style={{ gridArea: 'main', background: 'var(--bg-base)' }} />
      <div style={{ gridArea: 'statusbar', background: 'var(--status-bar-bg)', color: 'var(--status-bar-text)' }} />
    </div>
  )
}
```

- [ ] **Step 3: Verify layout**

```bash
npm run dev
```

Expected: Dark window with a thin top bar, empty left column (sidebar area), empty main area, blue status bar at bottom.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add VS Code dark theme CSS and grid layout"
```

---

## Task 4: SQLite setup + initial migration

**Files:**
- Create: `src/main/db/sqlite.js`
- Create: `src/main/db/migrations/001_initial.sql`
- Create: `tests/main/db/sqlite.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/db/sqlite.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/main/db/sqlite.test.js
```

Expected: FAIL — `initDb` not found.

- [ ] **Step 3: Create `src/main/db/migrations/001_initial.sql`**

```sql
CREATE TABLE IF NOT EXISTS connections (
  id           VARCHAR(255) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  type         VARCHAR(20)  NOT NULL,
  host         VARCHAR(255) NOT NULL,
  port         INTEGER      NOT NULL,
  database     VARCHAR(255),
  username     VARCHAR(255) NOT NULL,
  password     TEXT         NOT NULL,
  created_at   VARCHAR(30)  NOT NULL
);

CREATE TABLE IF NOT EXISTS restore_jobs (
  id                    VARCHAR(255) PRIMARY KEY,
  backup_file           TEXT         NOT NULL,
  target_connection_id  VARCHAR(255) NOT NULL,
  target_database       VARCHAR(255) NOT NULL,
  content_mode          VARCHAR(20)  NOT NULL,
  status                VARCHAR(20)  NOT NULL DEFAULT 'in_progress',
  created_at            VARCHAR(30)  NOT NULL,
  completed_at          VARCHAR(30),
  FOREIGN KEY (target_connection_id) REFERENCES connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restore_checkpoints (
  id                VARCHAR(255) PRIMARY KEY,
  job_id            VARCHAR(255) NOT NULL,
  object_type       VARCHAR(50)  NOT NULL,
  object_name       VARCHAR(255) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  row_count_source  INTEGER,
  row_count_target  INTEGER,
  completed_at      VARCHAR(30),
  FOREIGN KEY (job_id) REFERENCES restore_jobs(id) ON DELETE CASCADE
);
```

- [ ] **Step 4: Create `src/main/db/sqlite.js`**

```js
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _db = null

export function initDb(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name     VARCHAR(255) PRIMARY KEY,
    run_at   VARCHAR(30)  NOT NULL
  )`)

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const already = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(file)
    if (!already) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      db.exec(sql)
      db.prepare('INSERT INTO migrations (name, run_at) VALUES (?, ?)').run(file, new Date().toISOString())
    }
  }

  return db
}

export function getDb() {
  if (!_db) throw new Error('DB not initialized — call openDb() first')
  return _db
}

export function openDb(dbPath) {
  _db = initDb(dbPath)
  return _db
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/main/db/sqlite.test.js
```

Expected: PASS — 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add SQLite setup with initial migration for all 3 tables"
```

---

## Task 5: Connection repository

**Files:**
- Create: `src/main/db/connection-repository.js`
- Create: `tests/main/db/connection-repository.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/db/connection-repository.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { initDb, openDb } from '../../../src/main/db/sqlite.js'

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString()
  }
}))

import {
  listConnections,
  createConnection,
  getConnection,
  updateConnection,
  deleteConnection
} from '../../../src/main/db/connection-repository.js'

const SAMPLE = {
  name: 'local-mysql',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: 'secret'
}

beforeEach(() => { openDb(':memory:') })

describe('connection-repository', () => {
  it('creates and lists a connection', () => {
    const id = createConnection(SAMPLE)
    const list = listConnections()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)
    expect(list[0].name).toBe('local-mysql')
    expect(list[0].password).toBeUndefined()
  })

  it('getConnection returns decrypted password', () => {
    const id = createConnection(SAMPLE)
    const conn = getConnection(id)
    expect(conn.password).toBe('secret')
  })

  it('updates a connection', () => {
    const id = createConnection(SAMPLE)
    updateConnection(id, { ...SAMPLE, name: 'updated', password: 'newpass' })
    const conn = getConnection(id)
    expect(conn.name).toBe('updated')
    expect(conn.password).toBe('newpass')
  })

  it('deletes a connection', () => {
    const id = createConnection(SAMPLE)
    deleteConnection(id)
    expect(listConnections()).toHaveLength(0)
  })

  it('getConnection returns null for unknown id', () => {
    expect(getConnection('does-not-exist')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/main/db/connection-repository.test.js
```

Expected: FAIL — `createConnection` not found.

- [ ] **Step 3: Create `src/main/db/connection-repository.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/main/db/connection-repository.test.js
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add connection repository with encrypted password storage"
```

---

## Task 6: Connection IPC handlers + preload bridge

**Files:**
- Create: `src/main/ipc/connections-ipc.js`
- Modify: `src/preload/index.js`
- Modify: `src/main/index.js`

- [ ] **Step 1: Create `src/main/ipc/connections-ipc.js`**

```js
import { ipcMain } from 'electron'
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection
} from '../db/connection-repository.js'

export function registerConnectionsIpc() {
  ipcMain.handle('connections:list', () => listConnections())
  ipcMain.handle('connections:get', (_, id) => getConnection(id))
  ipcMain.handle('connections:create', (_, data) => createConnection(data))
  ipcMain.handle('connections:update', (_, id, data) => updateConnection(id, data))
  ipcMain.handle('connections:delete', (_, id) => deleteConnection(id))
}
```

- [ ] **Step 2: Replace `src/preload/index.js`**

```js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  connections: {
    list:   ()        => ipcRenderer.invoke('connections:list'),
    get:    (id)      => ipcRenderer.invoke('connections:get', id),
    create: (data)    => ipcRenderer.invoke('connections:create', data),
    update: (id, data)=> ipcRenderer.invoke('connections:update', id, data),
    delete: (id)      => ipcRenderer.invoke('connections:delete', id)
  },
  schema: {
    listDatabases: (connectionId)           => ipcRenderer.invoke('schema:listDatabases', connectionId),
    listObjects:   (connectionId, database) => ipcRenderer.invoke('schema:listObjects', connectionId, database)
  }
})
```

- [ ] **Step 3: Update `src/main/index.js` to open DB and register IPC**

Add these imports and calls after the existing imports:

```js
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openDb } from './db/sqlite.js'
import { registerConnectionsIpc } from './ipc/connections-ipc.js'

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
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mymariadb')
  app.on('browser-window-created', (_, window) => optimizer.watchShortcuts(window))

  const dbPath = join(app.getPath('userData'), 'mymariadb.db')
  openDb(dbPath)
  registerConnectionsIpc()

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 4: Verify app launches with no errors**

```bash
npm run dev
```

Expected: App opens, DevTools console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add connections IPC handlers and contextBridge preload"
```

---

## Task 7: useConnectionStore

**Files:**
- Create: `src/renderer/src/stores/useConnectionStore.js`
- Create: `tests/renderer/stores/useConnectionStore.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/renderer/stores/useConnectionStore.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useConnectionStore } from '../../../src/renderer/src/stores/useConnectionStore.js'

const mockConnections = [
  { id: 'uuid-1', name: 'local', type: 'mysql', host: 'localhost', port: 3306 }
]

beforeEach(() => {
  global.window = {
    api: {
      connections: {
        list:   vi.fn().mockResolvedValue(mockConnections),
        create: vi.fn().mockResolvedValue('uuid-2'),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      }
    }
  }
  useConnectionStore.setState({ connections: [], activeConnectionId: null })
})

describe('useConnectionStore', () => {
  it('loadConnections fetches and stores connections', async () => {
    const { result } = renderHook(() => useConnectionStore())
    await act(() => result.current.loadConnections())
    expect(result.current.connections).toEqual(mockConnections)
  })

  it('setActiveConnection updates activeConnectionId', () => {
    const { result } = renderHook(() => useConnectionStore())
    act(() => result.current.setActiveConnection('uuid-1'))
    expect(result.current.activeConnectionId).toBe('uuid-1')
  })

  it('createConnection calls api and reloads', async () => {
    const { result } = renderHook(() => useConnectionStore())
    await act(() => result.current.createConnection({ name: 'new' }))
    expect(window.api.connections.create).toHaveBeenCalledWith({ name: 'new' })
    expect(window.api.connections.list).toHaveBeenCalled()
  })

  it('deleteConnection calls api and reloads', async () => {
    useConnectionStore.setState({ connections: mockConnections })
    const { result } = renderHook(() => useConnectionStore())
    await act(() => result.current.deleteConnection('uuid-1'))
    expect(window.api.connections.delete).toHaveBeenCalledWith('uuid-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/renderer/stores/useConnectionStore.test.jsx
```

Expected: FAIL — `useConnectionStore` not found.

- [ ] **Step 3: Create `src/renderer/src/stores/useConnectionStore.js`**

```js
import { create } from 'zustand'

export const useConnectionStore = create((set, get) => ({
  connections: [],
  activeConnectionId: null,

  loadConnections: async () => {
    const connections = await window.api.connections.list()
    set({ connections })
  },

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  createConnection: async (data) => {
    await window.api.connections.create(data)
    await get().loadConnections()
  },

  updateConnection: async (id, data) => {
    await window.api.connections.update(id, data)
    await get().loadConnections()
  },

  deleteConnection: async (id) => {
    await window.api.connections.delete(id)
    const { activeConnectionId } = get()
    if (activeConnectionId === id) set({ activeConnectionId: null })
    await get().loadConnections()
  }
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/renderer/stores/useConnectionStore.test.jsx
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add useConnectionStore with Zustand"
```

---

## Task 8: TitleBar component

**Files:**
- Create: `src/renderer/src/components/TitleBar/TitleBar.jsx`

- [ ] **Step 1: Create `src/renderer/src/components/TitleBar/TitleBar.jsx`**

```jsx
import { useState } from 'react'
import ConnectionDialog from '../ConnectionDialog/ConnectionDialog'

export default function TitleBar() {
  const [showDialog, setShowDialog] = useState(false)

  return (
    <div style={{
      gridArea: 'titlebar',
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      userSelect: 'none'
    }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>MyMariaDB</span>
      <button
        onClick={() => setShowDialog(true)}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          padding: '3px 10px',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      >
        + New Connection
      </button>
      {showDialog && <ConnectionDialog onClose={() => setShowDialog(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: add TitleBar component with New Connection button"
```

---

## Task 9: ConnectionDialog component

**Files:**
- Create: `src/renderer/src/components/ConnectionDialog/ConnectionDialog.jsx`
- Create: `src/renderer/src/components/ConnectionDialog/ConnectionDialog.css`

- [ ] **Step 1: Create `src/renderer/src/components/ConnectionDialog/ConnectionDialog.css`**

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 420px;
  padding: 20px;
}

.dialog h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.field {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input,
.field select {
  width: 100%;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 100px;
  gap: 8px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  padding: 5px 16px;
  border-radius: 3px;
}

.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 5px 16px;
  border-radius: 3px;
}

.error-msg {
  color: var(--text-error);
  font-size: 11px;
  margin-top: 8px;
}
```

- [ ] **Step 2: Create `src/renderer/src/components/ConnectionDialog/ConnectionDialog.jsx`**

```jsx
import { useState } from 'react'
import { useConnectionStore } from '../../stores/useConnectionStore'
import './ConnectionDialog.css'

const DEFAULT_PORTS = { mysql: 3306, mariadb: 3306, mssql: 1433 }

export default function ConnectionDialog({ onClose, existing = null }) {
  const { createConnection, updateConnection } = useConnectionStore()
  const [form, setForm] = useState(existing ?? {
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: ''
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [field]: value }
      if (field === 'type') next.port = DEFAULT_PORTS[value]
      return next
    })
  }

  const handleSave = async () => {
    if (!form.name || !form.host || !form.username) {
      setError('Name, host, and username are required.')
      return
    }
    setSaving(true)
    try {
      if (existing) {
        await updateConnection(existing.id, form)
      } else {
        await createConnection(form)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>{existing ? 'Edit Connection' : 'New Connection'}</h2>

        <div className="field">
          <label>Connection Name</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. prod-mysql" />
        </div>

        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={set('type')}>
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="mssql">MSSQL (SQL Server)</option>
          </select>
        </div>

        <div className="field field-row">
          <div className="field" style={{ margin: 0 }}>
            <label>Host</label>
            <input value={form.host} onChange={set('host')} placeholder="localhost" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Port</label>
            <input type="number" value={form.port} onChange={set('port')} />
          </div>
        </div>

        <div className="field">
          <label>Database (optional)</label>
          <input value={form.database} onChange={set('database')} placeholder="default database" />
        </div>

        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={set('username')} />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add ConnectionDialog component for add/edit connections"
```

---

## Task 10: Active connection manager

**Files:**
- Create: `src/main/connections/connection-manager.js`
- Create: `tests/main/connections/connection-manager.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/connections/connection-manager.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue([[{ '1': 1 }]]),
      end: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

vi.mock('mssql', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      request: vi.fn().mockReturnValue({
        query: vi.fn().mockResolvedValue({ recordset: [{ '': 1 }] })
      }),
      close: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

import { getActiveConnection, closeConnection, testConnection } from '../../../src/main/connections/connection-manager.js'

beforeEach(() => closeConnection('test-id').catch(() => {}))

const MYSQL_CONFIG = { id: 'test-id', type: 'mysql', host: 'localhost', port: 3306, username: 'root', password: 'pw', database: 'db' }
const MSSQL_CONFIG = { id: 'test-id', type: 'mssql', host: 'localhost', port: 1433, username: 'sa', password: 'pw', database: 'db' }

describe('connection-manager', () => {
  it('testConnection returns ok:true for mysql', async () => {
    const result = await testConnection(MYSQL_CONFIG)
    expect(result.ok).toBe(true)
  })

  it('testConnection returns ok:true for mssql', async () => {
    const result = await testConnection(MSSQL_CONFIG)
    expect(result.ok).toBe(true)
  })

  it('caches the connection on second call', async () => {
    const import_mysql = await import('mysql2/promise')
    await getActiveConnection(MYSQL_CONFIG)
    await getActiveConnection(MYSQL_CONFIG)
    expect(import_mysql.default.createConnection).toHaveBeenCalledTimes(1)
  })

  it('testConnection returns ok:false on driver error', async () => {
    const config = { ...MYSQL_CONFIG, id: 'bad-id' }
    const mysql = await import('mysql2/promise')
    mysql.default.createConnection.mockRejectedValueOnce(new Error('refused'))
    const result = await testConnection(config)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('refused')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/main/connections/connection-manager.test.js
```

Expected: FAIL — `getActiveConnection` not found.

- [ ] **Step 3: Create `src/main/connections/connection-manager.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/main/connections/connection-manager.test.js
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add connection manager for mysql2 and mssql active connections"
```

---

## Task 11: Schema IPC (list databases + list objects)

**Files:**
- Create: `src/main/ipc/schema-ipc.js`
- Modify: `src/main/index.js`

- [ ] **Step 1: Create `src/main/ipc/schema-ipc.js`**

```js
import { ipcMain } from 'electron'
import { getConnection as getStoredConnection } from '../db/connection-repository.js'
import { getActiveConnection } from '../connections/connection-manager.js'

export function registerSchemaIpc() {
  ipcMain.handle('schema:listDatabases', async (_, connectionId) => {
    const stored = getStoredConnection(connectionId)
    const conn = await getActiveConnection(stored)

    if (stored.type === 'mssql') {
      const result = await conn.request().query('SELECT name FROM sys.databases WHERE name NOT IN (\'master\',\'tempdb\',\'model\',\'msdb\') ORDER BY name')
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
      const result = await conn.request().input('db', database).query(`
        SELECT t.name, 'TABLE' as object_type FROM [${database}].INFORMATION_SCHEMA.TABLES t WHERE t.TABLE_TYPE = 'BASE TABLE'
        UNION ALL
        SELECT v.name, 'VIEW' FROM [${database}].INFORMATION_SCHEMA.VIEWS v
        UNION ALL
        SELECT r.ROUTINE_NAME, r.ROUTINE_TYPE FROM [${database}].INFORMATION_SCHEMA.ROUTINES r
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
```

- [ ] **Step 2: Register schema IPC in `src/main/index.js`**

Add to imports:
```js
import { registerSchemaIpc } from './ipc/schema-ipc.js'
```

Add to `app.whenReady()` block after `registerConnectionsIpc()`:
```js
registerSchemaIpc()
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add schema IPC for listing databases and objects"
```

---

## Task 12: Sidebar + ConnectionTree

**Files:**
- Create: `src/renderer/src/components/Sidebar/Sidebar.jsx`
- Create: `src/renderer/src/components/Sidebar/ConnectionTree.jsx`
- Create: `src/renderer/src/components/Sidebar/Sidebar.css`
- Modify: `src/renderer/src/App.jsx`

- [ ] **Step 1: Create `src/renderer/src/components/Sidebar/Sidebar.css`**

```css
.sidebar {
  grid-area: sidebar;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.sidebar-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-section-label {
  padding: 4px 12px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-item:hover { background: var(--bg-hover); }
.tree-item.selected { background: var(--bg-selected); }

.tree-item .arrow { font-size: 9px; color: var(--text-secondary); min-width: 10px; }
.tree-item .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tree-item .status-dot.connected    { background: #89d185; }
.tree-item .status-dot.error        { background: #f48771; }
.tree-item .status-dot.idle         { background: #d7ba7d; }

.tree-children { padding-left: 12px; }

.sidebar-bottom {
  border-top: 1px solid var(--border);
  padding: 8px 12px;
}

.sidebar-backup-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-keyword);
  font-size: 12px;
  padding: 5px 0;
  cursor: pointer;
}

.sidebar-backup-link:hover { color: var(--accent); }
```

- [ ] **Step 2: Create `src/renderer/src/components/Sidebar/ConnectionTree.jsx`**

```jsx
import { useState, useEffect } from 'react'

const OBJECT_TYPE_LABELS = {
  'BASE TABLE': 'Tables',
  'VIEW': 'Views',
  'PROCEDURE': 'Stored Procs',
  'FUNCTION': 'Functions',
  'TRIGGER': 'Triggers'
}

function groupObjects(objects) {
  const groups = {}
  for (const obj of objects) {
    const label = OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type
    if (!groups[label]) groups[label] = []
    groups[label].push(obj.name)
  }
  return groups
}

function ObjectGroup({ label, items }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 36 }} onClick={() => setOpen(o => !o)}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-string)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({items.length})</span>
      </div>
      {open && (
        <div className="tree-children">
          {items.map(name => (
            <div key={name} className="tree-item" style={{ paddingLeft: 48, color: 'var(--text-secondary)' }}>
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DatabaseNode({ connectionId, dbName }) {
  const [open, setOpen] = useState(false)
  const [objects, setObjects] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (!open && objects === null) {
      setLoading(true)
      try {
        const list = await window.api.schema.listObjects(connectionId, dbName)
        setObjects(list)
      } catch { setObjects([]) }
      finally { setLoading(false) }
    }
    setOpen(o => !o)
  }

  const groups = objects ? groupObjects(objects) : {}

  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 24 }} onClick={handleToggle}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-accent)' }}>{dbName}</span>
        {loading && <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}> loading…</span>}
      </div>
      {open && objects !== null && (
        <div className="tree-children">
          {Object.entries(groups).map(([label, items]) => (
            <ObjectGroup key={label} label={label} items={items} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConnectionTree({ connection }) {
  const [open, setOpen] = useState(false)
  const [databases, setDatabases] = useState(null)
  const [status, setStatus] = useState('idle')

  const handleToggle = async () => {
    if (!open && databases === null) {
      setStatus('connecting')
      try {
        const dbs = await window.api.schema.listDatabases(connection.id)
        setDatabases(dbs)
        setStatus('connected')
      } catch {
        setStatus('error')
        setDatabases([])
      }
    }
    setOpen(o => !o)
  }

  return (
    <div>
      <div className="tree-item" onClick={handleToggle}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span className={`status-dot ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'idle'}`} />
        <span style={{ color: 'var(--text-type)' }}>{connection.name}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({connection.type})</span>
      </div>
      {open && databases !== null && (
        <div className="tree-children">
          {databases.map(db => (
            <DatabaseNode key={db} connectionId={connection.id} dbName={db} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/renderer/src/components/Sidebar/Sidebar.jsx`**

```jsx
import { useEffect } from 'react'
import { useConnectionStore } from '../../stores/useConnectionStore'
import ConnectionTree from './ConnectionTree'
import './Sidebar.css'

export default function Sidebar() {
  const { connections, loadConnections } = useConnectionStore()

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
        <div className="sidebar-backup-link">
          💾 Backup / Restore
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Create `src/renderer/src/components/StatusBar/StatusBar.jsx`**

```jsx
export default function StatusBar({ message = 'Ready' }) {
  return (
    <div style={{
      gridArea: 'statusbar',
      background: 'var(--status-bar-bg)',
      color: 'var(--status-bar-text)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      fontSize: '11px',
      gap: '12px'
    }}>
      <span>{message}</span>
    </div>
  )
}
```

- [ ] **Step 5: Wire everything together in `src/renderer/src/App.jsx`**

```jsx
import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'

export default function App() {
  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar />
      <main style={{ gridArea: 'main', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Open a connection from the sidebar to begin
        </span>
      </main>
      <StatusBar />
    </div>
  )
}
```

- [ ] **Step 6: Verify the full app end-to-end**

```bash
npm run dev
```

Expected:
- App opens with dark theme
- Sidebar shows "No connections yet" initially
- Clicking "+ New Connection" opens the dialog
- Fill in a real MySQL/MariaDB/MSSQL connection and save
- Connection appears in the sidebar with a grey dot
- Clicking it expands and shows databases
- Expanding a database shows Tables, Views, Stored Procs groups

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add Sidebar and ConnectionTree components — Plan 1 complete"
```

---

## Task 13: Run all tests

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass. If any fail, fix before proceeding to Plan 2.

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "chore: all Plan 1 tests passing"
```

---

## What's Next

**Plan 2 — Query Tool:** Monaco editor tabs, query execution against active connections, results grid with 50-row limit and CSV export, status bar with row count and query time.

**Plan 3 — Backup & Restore:** 4-step backup wizard, worker thread backup engine with MySQL→MariaDB compatibility transforms, checkpointed restore with resume, row count verification.
