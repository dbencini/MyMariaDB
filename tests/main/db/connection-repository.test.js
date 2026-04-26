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
