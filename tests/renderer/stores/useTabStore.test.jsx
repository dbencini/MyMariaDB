import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    const id = useTabStore.getState().addTab()
    const state = useTabStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(state.tabs[0].id)
    expect(state.tabs[0].limitRows).toBe(true)
    expect(state.tabs[0].results).toBeNull()
  })

  it('closeTab removes the tab and clears activeTabId when last tab', () => {
    const id = useTabStore.getState().addTab()
    useTabStore.getState().closeTab(id)
    const state = useTabStore.getState()
    expect(state.tabs).toHaveLength(0)
    expect(state.activeTabId).toBeNull()
  })

  it('closeTab sets activeTabId to previous tab when active tab is closed', () => {
    const state1 = useTabStore.getState()
    const id1 = state1.addTab()
    const id2 = state1.addTab()
    state1.closeTab(id2)
    const state = useTabStore.getState()
    expect(state.activeTabId).toBe(id1)
  })

  it('toggleTabLimit flips limitRows', () => {
    const id = useTabStore.getState().addTab()
    expect(useTabStore.getState().tabs[0].limitRows).toBe(true)
    useTabStore.getState().toggleTabLimit(id)
    expect(useTabStore.getState().tabs[0].limitRows).toBe(false)
  })

  it('runTab calls api.query.execute with correct params and stores results', async () => {
    const id = useTabStore.getState().addTab({ connectionId: 'c1', database: 'mydb', sql: 'SELECT 1' })
    await useTabStore.getState().runTab(id)
    expect(window.api.query.execute).toHaveBeenCalledWith({
      connectionId: 'c1', database: 'mydb', sql: 'SELECT 1', limit: 50
    })
    const tab = useTabStore.getState().tabs[0]
    expect(tab.results.rowCount).toBe(1)
    expect(tab.running).toBe(false)
    expect(tab.serverVersion).toBe('8.0.42')
  })

  it('runTab does nothing if tab has no connectionId', async () => {
    const id = useTabStore.getState().addTab({ sql: 'SELECT 1' })
    await useTabStore.getState().runTab(id)
    expect(window.api.query.execute).not.toHaveBeenCalled()
  })

  it('addAndRunTab adds tab and immediately runs it', async () => {
    await useTabStore.getState().addAndRunTab({
      connectionId: 'c1', database: 'db', sql: 'SELECT * FROM users', title: 'preview'
    })
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(window.api.query.execute).toHaveBeenCalled()
  })
})
