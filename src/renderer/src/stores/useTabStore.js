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
