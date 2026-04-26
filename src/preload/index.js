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
    listDatabases: (connectionId)            => ipcRenderer.invoke('schema:listDatabases', connectionId),
    listObjects:   (connectionId, database)  => ipcRenderer.invoke('schema:listObjects', connectionId, database)
  }
})
