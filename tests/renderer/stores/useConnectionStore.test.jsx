import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    await useConnectionStore.getState().loadConnections()
    expect(useConnectionStore.getState().connections).toEqual(mockConnections)
  })

  it('setActiveConnection updates activeConnectionId', () => {
    useConnectionStore.getState().setActiveConnection('uuid-1')
    expect(useConnectionStore.getState().activeConnectionId).toBe('uuid-1')
  })

  it('createConnection calls api and reloads', async () => {
    await useConnectionStore.getState().createConnection({ name: 'new' })
    expect(window.api.connections.create).toHaveBeenCalledWith({ name: 'new' })
    expect(window.api.connections.list).toHaveBeenCalled()
  })

  it('deleteConnection calls api and reloads', async () => {
    useConnectionStore.setState({ connections: mockConnections })
    await useConnectionStore.getState().deleteConnection('uuid-1')
    expect(window.api.connections.delete).toHaveBeenCalledWith('uuid-1')
  })
})
