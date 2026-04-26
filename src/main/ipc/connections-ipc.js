import { ipcMain } from 'electron'
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection
} from '../db/connection-repository.js'

export function registerConnectionsIpc() {
  ipcMain.handle('connections:list', () => listConnections())
  ipcMain.handle('connections:get', (_, id) => getConnection(id))
  ipcMain.handle('connections:create', (_, data) => createConnection(data))
  ipcMain.handle('connections:update', (_, id, data) => updateConnection(id, data))
  ipcMain.handle('connections:delete', (_, id) => deleteConnection(id))
}
