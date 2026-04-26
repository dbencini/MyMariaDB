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
    name: 'C:/tmp/mymariadb.db',
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

  it('backup:cancel sends cancel message to the worker', async () => {
    const { jobId } = await handlers['backup:start'](null, {
      connectionId: 'c1', database: 'mydb', tables: [],
      mode: 'schema+data', includeObjects: false,
      outputPath: 'C:/tmp/test.sql', format: 'sql'
    })
    await handlers['backup:cancel'](null, { jobId })
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'cancel' })
  })
})
