# MyMariaDB — Plan 2: Query Tool

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adds a full query editor — Monaco SQL editor in resizable tabs, F5 execution, a sortable read-only results grid with a 50-row limit toggle and CSV export, and a live status bar showing row count, timing, and connection info.

**Architecture:** All query execution stays in the main process via a new `query:execute` IPC channel. The renderer stores tab state in a new Zustand store (`useTabStore`). Each tab is independently stateful: its own SQL buffer, results, running flag, and limit toggle. The sidebar gets a right-click context menu to open preview tabs that auto-execute.

**Tech Stack:** React, Zustand, `@monaco-editor/react`, mysql2, mssql, Vitest

---

## File Map

```
src/
├── main/
│   └── ipc/
│       └── query-ipc.js              NEW: query:execute IPC handler
├── preload/
│   └── index.js                      MODIFY: add query.execute
└── renderer/
    └── src/
        ├── utils/
        │   └── formatDate.js         NEW: formatDate(iso) → "26 Apr 2026"
        ├── stores/
        │   └── useTabStore.js        NEW: Zustand tab state
        └── components/
            ├── TabBar/
            │   ├── TabBar.jsx        NEW: tab strip with add/close/rename
            │   └── TabBar.css        NEW
            ├── QueryTab/
            │   ├── QueryTab.jsx      NEW: Monaco editor + toolbar + ResultsGrid
            │   └── QueryTab.css      NEW
            ├── ResultsGrid/
            │   ├── ResultsGrid.jsx   NEW: sortable table, limit checkbox, CSV
            │   └── ResultsGrid.css   NEW
            ├── Sidebar/
            │   └── ConnectionTree.jsx  MODIFY: right-click context menu on tables
            └── StatusBar/
                └── StatusBar.jsx     MODIFY: accept left/right/leftError props

tests/
├── main/
│   └── ipc/
│       └── query-ipc.test.js         NEW
└── renderer/
    ├── utils/
    │   └── formatDate.test.jsx       NEW
    └── stores/
        └── useTabStore.test.jsx      NEW
```

**Also modified:**
- `src/main/index.js` — register `registerQueryIpc()`
- `src/renderer/src/App.jsx` — wire TabBar + QueryTab + updated StatusBar
- `vitest.config.mjs` — extend renderer include to `*.test.{js,jsx}`

---

## Task 1: formatDate utility

**Files:**
- Create: `src/renderer/src/utils/formatDate.js`
- Create: `tests/renderer/utils/formatDate.test.jsx`
- Modify: `vitest.config.mjs`

- [ ] **Step 1: Update `vitest.config.mjs` to pick up `.test.js` files in renderer tests**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        name: 'main',
        test: {
          include: ['tests/main/**/*.test.js'],
          environment: 'node'
        }
      },
      {
        name: 'renderer',
        test: {
          include: ['tests/renderer/**/*.test.{js,jsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/renderer/setup.js']
        }
      }
    ]
  }
})
```

- [ ] **Step 2: Write the failing test**

Create `tests/renderer/utils/formatDate.test.jsx`:

```js
import { describe, it, expect } from 'vitest'
import { formatDate } from '../../../src/renderer/src/utils/formatDate.js'

describe('formatDate', () => {
  it('formats ISO string as DD MMM YYYY', () => {
    expect(formatDate('2026-04-26T14:30:00.000Z')).toBe('26 Apr 2026')
  })

  it('formats first of January correctly', () => {
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026')
  })

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/renderer/utils/formatDate.test.jsx
```

Expected: FAIL — `formatDate` not found.

- [ ] **Step 4: Create `src/renderer/src/utils/formatDate.js`**

```js
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/renderer/utils/formatDate.test.jsx
```

Expected: PASS — 4 tests passing.

- [ ] **Step 6: Commit**

```bash
cd c:/development/MyMariaDB && git add vitest.config.mjs src/renderer/src/utils/formatDate.js tests/renderer/utils/formatDate.test.jsx && git commit -m "feat: add formatDate utility (DD MMM YYYY)"
```

---

## Task 2: Query IPC handler

**Files:**
- Create: `src/main/ipc/query-ipc.js`
- Create: `tests/main/ipc/query-ipc.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/main/ipc/query-ipc.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../../../src/main/db/connection-repository.js', () => ({
  getConnection: vi.fn().mockReturnValue({
    id: 'c1', type: 'mysql', host: 'localhost', port: 3306,
    username: 'root', password: 'pw', database: 'db'
  })
}))

const mockQuery = vi.fn().mockResolvedValue([
  [{ id: 1, name: 'Alice' }],
  [{ name: 'id' }, { name: 'name' }]
])

vi.mock('../../../src/main/connections/connection-manager.js', () => ({
  getActiveConnection: vi.fn().mockResolvedValue({ query: mockQuery })
}))

import { ipcMain } from 'electron'
import { registerQueryIpc } from '../../../src/main/ipc/query-ipc.js'

describe('query-ipc', () => {
  let handler

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue([
      [{ id: 1, name: 'Alice' }],
      [{ name: 'id' }, { name: 'name' }]
    ])
    ipcMain.handle.mockImplementation((channel, fn) => {
      if (channel === 'query:execute') handler = fn
    })
    registerQueryIpc()
  })

  it('executes a mysql query and returns columns and rows', async () => {
    const result = await handler(null, {
      connectionId: 'c1', database: 'db',
      sql: 'SELECT id, name FROM users', limit: 0
    })
    expect(result.columns).toEqual(['id', 'name'])
    expect(result.rows).toHaveLength(1)
    expect(result.rowCount).toBe(1)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('wraps SQL with LIMIT when limit > 0', async () => {
    await handler(null, {
      connectionId: 'c1', database: 'db',
      sql: 'SELECT * FROM users', limit: 50
    })
    const calls = mockQuery.mock.calls.map(c => c[0])
    expect(calls.some(sql => sql.includes('LIMIT 50'))).toBe(true)
  })

  it('returns error object on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('table not found'))
    const result = await handler(null, {
      connectionId: 'c1', database: 'db',
      sql: 'SELECT * FROM nope', limit: 0
    })
    expect(result.error).toBe('table not found')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/ipc/query-ipc.test.js
```

Expected: FAIL — `registerQueryIpc` not found.

- [ ] **Step 3: Create `src/main/ipc/query-ipc.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/main/ipc/query-ipc.test.js
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
cd c:/development/MyMariaDB && git add src/main/ipc/query-ipc.js tests/main/ipc/query-ipc.test.js && git commit -m "feat: add query IPC handler with limit wrapping and server version caching"
```

---

## Task 3: Preload + index.js wiring

**Files:**
- Modify: `src/preload/index.js`
- Modify: `src/main/index.js`

No automated tests — wiring only.

- [ ] **Step 1: Add `query` namespace to `src/preload/index.js`**

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
  }
})
```

- [ ] **Step 2: Register query IPC in `src/main/index.js`**

Add `import { registerQueryIpc } from './ipc/query-ipc.js'` after the existing imports.

Add `registerQueryIpc()` after `registerSchemaIpc()` in the `app.whenReady()` block.

Full updated file:

```js
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { openDb } from './db/sqlite.js'
import { registerConnectionsIpc } from './ipc/connections-ipc.js'
import { registerSchemaIpc } from './ipc/schema-ipc.js'
import { registerQueryIpc } from './ipc/query-ipc.js'

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

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/preload/index.js src/main/index.js && git commit -m "feat: wire query IPC into preload and main process"
```

---

## Task 4: useTabStore

**Files:**
- Create: `src/renderer/src/stores/useTabStore.js`
- Create: `tests/renderer/stores/useTabStore.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/stores/useTabStore.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTabStore } from '../../../src/renderer/src/stores/useTabStore.js'

let tabCounter = 0

beforeEach(() => {
  tabCounter = 0
  global.window = {
    ...global.window,
    crypto: { randomUUID: () => `test-uuid-${++tabCounter}` },
    api: {
      query: {
        execute: vi.fn().mockResolvedValue({
          columns: ['id'], rows: [{ id: 1 }],
          rowCount: 1, durationMs: 10, serverVersion: '8.0.42'
        })
      }
    }
  }
  useTabStore.setState({ tabs: [], activeTabId: null })
})

describe('useTabStore', () => {
  it('addTab creates a tab with defaults and sets it active', () => {
    const { result } = renderHook(() => useTabStore())
    act(() => result.current.addTab())
    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id)
    expect(result.current.tabs[0].limitRows).toBe(true)
    expect(result.current.tabs[0].results).toBeNull()
  })

  it('closeTab removes the tab and clears activeTabId when last tab', () => {
    const { result } = renderHook(() => useTabStore())
    let id
    act(() => { id = result.current.addTab() })
    act(() => result.current.closeTab(id))
    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
  })

  it('closeTab sets activeTabId to previous tab when active tab is closed', () => {
    const { result } = renderHook(() => useTabStore())
    let id1, id2
    act(() => { id1 = result.current.addTab(); id2 = result.current.addTab() })
    act(() => result.current.closeTab(id2))
    expect(result.current.activeTabId).toBe(id1)
  })

  it('toggleTabLimit flips limitRows', () => {
    const { result } = renderHook(() => useTabStore())
    let id
    act(() => { id = result.current.addTab() })
    expect(result.current.tabs[0].limitRows).toBe(true)
    act(() => result.current.toggleTabLimit(id))
    expect(result.current.tabs[0].limitRows).toBe(false)
  })

  it('runTab calls api.query.execute with correct params and stores results', async () => {
    const { result } = renderHook(() => useTabStore())
    let id
    act(() => {
      id = result.current.addTab({ connectionId: 'c1', database: 'mydb', sql: 'SELECT 1' })
    })
    await act(() => result.current.runTab(id))
    expect(window.api.query.execute).toHaveBeenCalledWith({
      connectionId: 'c1', database: 'mydb', sql: 'SELECT 1', limit: 50
    })
    const tab = result.current.tabs[0]
    expect(tab.results.rowCount).toBe(1)
    expect(tab.running).toBe(false)
    expect(tab.serverVersion).toBe('8.0.42')
  })

  it('runTab does nothing if tab has no connectionId', async () => {
    const { result } = renderHook(() => useTabStore())
    let id
    act(() => { id = result.current.addTab({ sql: 'SELECT 1' }) })
    await act(() => result.current.runTab(id))
    expect(window.api.query.execute).not.toHaveBeenCalled()
  })

  it('addAndRunTab adds tab and immediately runs it', async () => {
    const { result } = renderHook(() => useTabStore())
    await act(() => result.current.addAndRunTab({
      connectionId: 'c1', database: 'db', sql: 'SELECT * FROM users', title: 'preview'
    }))
    expect(result.current.tabs).toHaveLength(1)
    expect(window.api.query.execute).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/renderer/stores/useTabStore.test.jsx
```

Expected: FAIL — `useTabStore` not found.

- [ ] **Step 3: Create `src/renderer/src/stores/useTabStore.js`**

```js
import { create } from 'zustand'

let _counter = 0

function newTab(overrides = {}) {
  _counter++
  const id = window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return {
    id,
    title: `Query ${_counter}`,
    sql: '',
    connectionId: null,
    database: null,
    results: null,
    running: false,
    limitRows: true,
    serverVersion: null,
    ...overrides
  }
}

export const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (overrides = {}) => {
    const tab = newTab(overrides)
    set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    return tab.id
  },

  closeTab: (id) => {
    set(s => {
      const tabs = s.tabs.filter(t => t.id !== id)
      const activeTabId = s.activeTabId === id
        ? (tabs[tabs.length - 1]?.id ?? null)
        : s.activeTabId
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabSql: (id, sql) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, sql } : t)
  })),

  updateTabTitle: (id, title) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, title } : t)
  })),

  toggleTabLimit: (id) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, limitRows: !t.limitRows } : t)
  })),

  runTab: async (id) => {
    const tab = get().tabs.find(t => t.id === id)
    if (!tab || !tab.connectionId || !tab.sql.trim()) return
    set(s => ({
      tabs: s.tabs.map(t => t.id === id ? { ...t, running: true, results: null } : t)
    }))
    const result = await window.api.query.execute({
      connectionId: tab.connectionId,
      database: tab.database,
      sql: tab.sql,
      limit: tab.limitRows ? 50 : 0
    })
    set(s => ({
      tabs: s.tabs.map(t => t.id === id ? {
        ...t,
        running: false,
        results: result,
        serverVersion: result.serverVersion ?? t.serverVersion
      } : t)
    }))
  },

  addAndRunTab: async (overrides = {}) => {
    const id = get().addTab(overrides)
    await get().runTab(id)
    return id
  }
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd c:/development/MyMariaDB && npm test -- --reporter=verbose tests/renderer/stores/useTabStore.test.jsx
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/stores/useTabStore.js tests/renderer/stores/useTabStore.test.jsx && git commit -m "feat: add useTabStore with tab lifecycle and query execution"
```

---

## Task 5: TabBar component

**Files:**
- Create: `src/renderer/src/components/TabBar/TabBar.jsx`
- Create: `src/renderer/src/components/TabBar/TabBar.css`

No automated tests.

- [ ] **Step 1: Create `src/renderer/src/components/TabBar/TabBar.css`**

```css
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
  min-height: 35px;
  flex-shrink: 0;
}

.tab-bar::-webkit-scrollbar { height: 3px; }
.tab-bar::-webkit-scrollbar-track { background: var(--bg-sidebar); }
.tab-bar::-webkit-scrollbar-thumb { background: var(--border); }

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  min-width: 90px;
  max-width: 180px;
  height: 35px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  border-right: 1px solid var(--border);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.tab-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.tab-item.active {
  background: var(--bg-base);
  color: var(--text-primary);
  border-top: 2px solid var(--accent);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-running {
  color: var(--accent);
  font-size: 10px;
  animation: tab-pulse 1s ease-in-out infinite;
}
@keyframes tab-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }

.tab-close {
  background: none;
  color: var(--text-secondary);
  font-size: 15px;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  line-height: 1;
  flex-shrink: 0;
}
.tab-close:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }

.tab-rename-input {
  flex: 1;
  font-size: 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-focus);
  color: var(--text-primary);
  padding: 1px 4px;
  outline: none;
  border-radius: 2px;
  height: 22px;
  font-family: var(--font-ui);
}

.tab-add {
  background: none;
  color: var(--text-secondary);
  font-size: 18px;
  padding: 0 12px;
  height: 35px;
  flex-shrink: 0;
  line-height: 1;
}
.tab-add:hover { color: var(--text-primary); background: var(--bg-hover); }
```

- [ ] **Step 2: Create `src/renderer/src/components/TabBar/TabBar.jsx`**

```jsx
import { useState } from 'react'
import { useTabStore } from '../../stores/useTabStore'
import './TabBar.css'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, updateTabTitle } = useTabStore()
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const startRename = (e, tab) => {
    e.stopPropagation()
    setEditingId(tab.id)
    setEditTitle(tab.title)
  }

  const commitRename = (id) => {
    if (editTitle.trim()) updateTabTitle(id, editTitle.trim())
    setEditingId(null)
  }

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={(e) => startRename(e, tab)}
        >
          {editingId === tab.id ? (
            <input
              className="tab-rename-input"
              value={editTitle}
              autoFocus
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => commitRename(tab.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(tab.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="tab-title">{tab.title}</span>
          )}
          {tab.running && <span className="tab-running">●</span>}
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
          >×</button>
        </div>
      ))}
      <button className="tab-add" onClick={() => addTab()}>+</button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/TabBar/ && git commit -m "feat: add TabBar component with rename and add/close"
```

---

## Task 6: ResultsGrid component

**Files:**
- Create: `src/renderer/src/components/ResultsGrid/ResultsGrid.jsx`
- Create: `src/renderer/src/components/ResultsGrid/ResultsGrid.css`

No automated tests.

- [ ] **Step 1: Create `src/renderer/src/components/ResultsGrid/ResultsGrid.css`**

```css
.results-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-top: 1px solid var(--border);
}

.results-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 10px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  font-size: 12px;
}

.limit-label {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.csv-btn {
  background: none;
  color: var(--text-keyword);
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
}
.csv-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.results-table-wrap {
  flex: 1;
  overflow: auto;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: var(--font-mono);
}

.results-table th {
  position: sticky;
  top: 0;
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-weight: 500;
  font-family: var(--font-ui);
  text-align: left;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.results-table th:hover { color: var(--text-primary); }
.sort-arrow { color: var(--accent); margin-left: 3px; }

.results-table td {
  padding: 3px 8px;
  color: var(--text-primary);
  white-space: nowrap;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-even { background: var(--bg-base); }
.row-odd  { background: var(--bg-row-alt); }

.null-val { color: var(--text-secondary); font-style: italic; }

.results-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  color: var(--text-secondary);
  font-size: 12px;
}

.results-error {
  padding: 10px 12px;
  color: var(--text-error);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 2: Create `src/renderer/src/components/ResultsGrid/ResultsGrid.jsx`**

```jsx
import { useState } from 'react'
import './ResultsGrid.css'

function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(columns, rows) {
  const header = columns.join(',')
  const body = rows.map(row => columns.map(c => csvEscape(row[c])).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsGrid({ results, limitRows, onToggleLimit }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const toolbar = (
    <div className="results-toolbar">
      <label className="limit-label">
        <input type="checkbox" checked={limitRows} onChange={onToggleLimit} />
        Limit 50 rows
      </label>
    </div>
  )

  if (!results) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-message">Run a query to see results</div>
      </div>
    )
  }

  if (results.error) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-error">{results.error}</div>
      </div>
    )
  }

  const { columns, rows } = results

  if (columns.length === 0) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-message">{results.rowCount} row(s) affected</div>
      </div>
    )
  }

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  return (
    <div className="results-pane">
      <div className="results-toolbar">
        <label className="limit-label">
          <input type="checkbox" checked={limitRows} onChange={onToggleLimit} />
          Limit 50 rows
        </label>
        <button className="csv-btn" onClick={() => downloadCsv(columns, sortedRows)}>
          ⬇ CSV
        </button>
      </div>
      <div className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} onClick={() => handleSort(col)}>
                  {col}
                  {sortCol === col && (
                    <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                {columns.map(col => (
                  <td key={col}>
                    {row[col] === null || row[col] === undefined
                      ? <span className="null-val">NULL</span>
                      : String(row[col])
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/ResultsGrid/ && git commit -m "feat: add ResultsGrid with sort, limit checkbox, and CSV export"
```

---

## Task 7: QueryTab component

**Files:**
- Create: `src/renderer/src/components/QueryTab/QueryTab.jsx`
- Create: `src/renderer/src/components/QueryTab/QueryTab.css`

No automated tests.

- [ ] **Step 1: Create `src/renderer/src/components/QueryTab/QueryTab.css`**

```css
.query-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.query-context-bar {
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.query-editor-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.query-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.run-btn {
  background: var(--accent);
  color: #fff;
  padding: 3px 14px;
  border-radius: 3px;
  font-size: 12px;
}
.run-btn:hover:not(:disabled) { background: var(--accent-hover); }
.run-btn:disabled { opacity: 0.55; cursor: default; }

.format-btn {
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 12px;
}
.format-btn:hover { background: var(--bg-hover); }

.query-editor-monaco {
  flex: 1;
  min-height: 0;
}

.query-results-section {
  height: 40%;
  min-height: 120px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Create `src/renderer/src/components/QueryTab/QueryTab.jsx`**

```jsx
import { useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useTabStore } from '../../stores/useTabStore'
import { useConnectionStore } from '../../stores/useConnectionStore'
import ResultsGrid from '../ResultsGrid/ResultsGrid'
import './QueryTab.css'

export default function QueryTab({ tabId }) {
  const { tabs, updateTabSql, runTab, toggleTabLimit } = useTabStore()
  const { connections } = useConnectionStore()
  const editorRef = useRef(null)

  const tab = tabs.find(t => t.id === tabId)
  if (!tab) return null

  const connection = connections.find(c => c.id === tab.connectionId)
  const contextLabel = tab.database && connection
    ? `${tab.database}  @  ${connection.name}`
    : 'No connection — open a connection from the sidebar'

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyCode.F5],
      run: () => runTab(tabId)
    })
  }

  const handleFormat = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run()
  }

  return (
    <div className="query-tab">
      <div className="query-context-bar">{contextLabel}</div>

      <div className="query-editor-section">
        <div className="query-editor-toolbar">
          <button
            className="run-btn"
            onClick={() => runTab(tabId)}
            disabled={tab.running || !tab.connectionId}
          >
            {tab.running ? '⏳ Running…' : '▶ Run (F5)'}
          </button>
          <button className="format-btn" onClick={handleFormat}>Format</button>
        </div>
        <div className="query-editor-monaco">
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={tab.sql}
            onChange={val => updateTabSql(tabId, val ?? '')}
            onMount={handleMount}
            options={{
              lineNumbers: 'on',
              minimap: { enabled: false },
              wordWrap: 'off',
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true
            }}
          />
        </div>
      </div>

      <div className="query-results-section">
        <ResultsGrid
          results={tab.results}
          limitRows={tab.limitRows}
          onToggleLimit={() => toggleTabLimit(tabId)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/QueryTab/ && git commit -m "feat: add QueryTab with Monaco editor, F5 binding, and results panel"
```

---

## Task 8: App.jsx + StatusBar wiring

**Files:**
- Modify: `src/renderer/src/components/StatusBar/StatusBar.jsx`
- Modify: `src/renderer/src/App.jsx`

No automated tests.

- [ ] **Step 1: Update `src/renderer/src/components/StatusBar/StatusBar.jsx`**

```jsx
export default function StatusBar({ left = 'Ready', right = '', leftError = false }) {
  return (
    <div style={{
      gridArea: 'statusbar',
      background: 'var(--status-bar-bg)',
      color: 'var(--status-bar-text)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 10px',
      fontSize: '11px',
      flexShrink: 0,
      gap: '12px'
    }}>
      <span style={leftError ? { color: '#ffcccc' } : {}}>{left}</span>
      {right && <span style={{ opacity: 0.8, marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/renderer/src/App.jsx`**

```jsx
import { useTabStore } from './stores/useTabStore'
import { useConnectionStore } from './stores/useConnectionStore'
import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import TabBar from './components/TabBar/TabBar'
import QueryTab from './components/QueryTab/QueryTab'
import StatusBar from './components/StatusBar/StatusBar'

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
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/StatusBar/StatusBar.jsx src/renderer/src/App.jsx && git commit -m "feat: wire App with TabBar, QueryTab, and live StatusBar"
```

---

## Task 9: Sidebar right-click context menu

**Files:**
- Modify: `src/renderer/src/components/Sidebar/ConnectionTree.jsx`

No automated tests.

- [ ] **Step 1: Replace `src/renderer/src/components/Sidebar/ConnectionTree.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useTabStore } from '../../stores/useTabStore'

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
    groups[label].push({ name: obj.name, type: obj.object_type })
  }
  return groups
}

function ContextMenu({ x, y, onPreview, onNewQuery, onClose }) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: 9999,
      background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
      borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      minWidth: 160, fontSize: 12
    }}>
      <div
        style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={e => { e.stopPropagation(); onPreview() }}
      >
        📋 Preview data
      </div>
      <div
        style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={e => { e.stopPropagation(); onNewQuery() }}
      >
        + New Query Tab
      </div>
    </div>
  )
}

function ObjectGroup({ label, items, connectionId, database, connectionType }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const { addAndRunTab, addTab } = useTabStore()
  const isTable = label === 'Tables'

  const handleContextMenu = (e, item) => {
    if (!isTable) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, item })
  }

  const handlePreview = () => {
    const name = menu.item.name
    const sql = connectionType === 'mssql'
      ? `SELECT * FROM [${name}]`
      : `SELECT * FROM \`${name}\``
    addAndRunTab({ title: `📋 ${name}`, sql, connectionId, database })
    setMenu(null)
  }

  const handleNewQuery = () => {
    addTab({ connectionId, database })
    setMenu(null)
  }

  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 36 }} onClick={() => setOpen(o => !o)}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-string)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({items.length})</span>
      </div>
      {open && (
        <div className="tree-children">
          {items.map(item => (
            <div
              key={item.name}
              className="tree-item"
              style={{ paddingLeft: 48, color: 'var(--text-secondary)' }}
              onContextMenu={e => handleContextMenu(e, item)}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          onPreview={handlePreview}
          onNewQuery={handleNewQuery}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function DatabaseNode({ connectionId, dbName, connectionType }) {
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
            <ObjectGroup
              key={label}
              label={label}
              items={items}
              connectionId={connectionId}
              database={dbName}
              connectionType={connectionType}
            />
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
            <DatabaseNode
              key={db}
              connectionId={connection.id}
              dbName={db}
              connectionType={connection.type}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd c:/development/MyMariaDB && git add src/renderer/src/components/Sidebar/ConnectionTree.jsx && git commit -m "feat: add right-click context menu on table items in sidebar"
```

---

## Task 10: Run all tests

- [ ] **Step 1: Run the full test suite**

```bash
cd c:/development/MyMariaDB && npm test
```

Expected: All tests pass.

```
✓ tests/renderer/utils/formatDate.test.jsx    (4 tests)
✓ tests/renderer/stores/useConnectionStore.test.jsx  (4 tests)
✓ tests/renderer/stores/useTabStore.test.jsx  (7 tests)
✓ tests/main/db/sqlite.test.js               (2 tests)
✓ tests/main/db/connection-repository.test.js (5 tests)
✓ tests/main/connections/connection-manager.test.js (4 tests)
✓ tests/main/ipc/query-ipc.test.js           (3 tests)

Test Files: 7 passed
Tests:      29 passed
```

If any test fails, fix before proceeding to Plan 3.

- [ ] **Step 2: Final commit**

```bash
cd c:/development/MyMariaDB && git add . && git commit -m "chore: all Plan 2 tests passing"
```

---

## What's Next

**Plan 3 — Backup & Restore:** 4-step backup wizard, worker thread backup engine with MySQL→MariaDB compatibility transforms, checkpointed restore with resume, row count verification.
