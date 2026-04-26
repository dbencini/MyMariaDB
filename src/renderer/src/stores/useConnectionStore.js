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
