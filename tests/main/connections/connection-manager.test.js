import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

beforeEach(async () => {
  await closeConnection('test-id').catch(() => {})
  await closeConnection('bad-id').catch(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
})

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
