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

vi.mock('../../../src/main/connections/connection-manager.js')

import { ipcMain } from 'electron'
import { getActiveConnection } from '../../../src/main/connections/connection-manager.js'
import { registerQueryIpc } from '../../../src/main/ipc/query-ipc.js'

describe('query-ipc', () => {
  let handler
  let mockQuery

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn().mockResolvedValue([
      [{ id: 1, name: 'Alice' }],
      [{ name: 'id' }, { name: 'name' }]
    ])
    vi.mocked(getActiveConnection).mockResolvedValue({ query: mockQuery })
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
