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
  },
  query: {
    execute: (params) => ipcRenderer.invoke('query:execute', params)
  },
  backup: {
    getTables:      (params)  => ipcRenderer.invoke('backup:getTables', params),
    start:          (options) => ipcRenderer.invoke('backup:start', options),
    cancel:         (jobId)   => ipcRenderer.invoke('backup:cancel', { jobId }),
    restoreStart:   (options) => ipcRenderer.invoke('restore:start', options),
    restoreChunked: (options) => ipcRenderer.invoke('restore:start-chunked', options),
    restoreCancel:  (jobId)   => ipcRenderer.invoke('restore:cancel', { jobId }),
    onProgress:     (cb)      => {
      ipcRenderer.on('backup:progress', (_, event) => cb(event))
      return () => ipcRenderer.removeAllListeners('backup:progress')
    }
  }
})
