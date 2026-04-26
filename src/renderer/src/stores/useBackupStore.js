import { create } from 'zustand'

const defaultBackupOptions = {
  connectionId: null,
  database: null,
  tables: [],        // [{ name, rowCount, selected }]
  mode: 'schema+data',
  includeObjects: true,
  outputPath: '',
  format: 'sql'
}

const defaultRestoreOptions = {
  filePath: '',
  fileInfo: null,    // { database, date, tableCount, connectionType }
  connectionId: null,
  database: ''
}

const defaultChunkedOptions = {
  filePath: '',
  connectionId: null,
  database: '',
  tableName: '',
  chunkSize: 5000,
  resumeFromRow: 0,
  existingJobId: null
}

export const useBackupStore = create((set, get) => ({
  open: false,
  activeTab: 'backup',  // 'backup' | 'restore' | 'chunked'

  // Backup wizard
  backupStep: 1,
  backupOptions: { ...defaultBackupOptions },
  backupLog: [],
  backupJobId: null,
  backupRunning: false,

  // Restore wizard
  restoreStep: 1,
  restoreOptions: { ...defaultRestoreOptions },
  restoreLog: [],
  restoreJobId: null,
  restoreRunning: false,
  restoreVerification: null,

  // Chunked restore wizard
  chunkedStep: 1,
  chunkedOptions: { ...defaultChunkedOptions },
  chunkedLog: [],
  chunkedJobId: null,
  chunkedRunning: false,

  openWizard: (tab = 'backup') => set({ open: true, activeTab: tab }),
  closeWizard: () => set({ open: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Backup actions
  setBackupStep: (s) => set({ backupStep: s }),
  setBackupOptions: (patch) => set(st => ({ backupOptions: { ...st.backupOptions, ...patch } })),
  toggleTable: (name) => set(st => ({
    backupOptions: {
      ...st.backupOptions,
      tables: st.backupOptions.tables.map(t => t.name === name ? { ...t, selected: !t.selected } : t)
    }
  })),
  appendBackupLog: (entry) => set(st => ({ backupLog: [...st.backupLog, entry] })),
  resetBackup: () => set({ backupStep: 1, backupOptions: { ...defaultBackupOptions }, backupLog: [], backupJobId: null, backupRunning: false }),

  startBackup: async () => {
    const { backupOptions } = get()
    const selectedTables = backupOptions.tables.filter(t => t.selected).map(t => t.name)
    const result = await window.api.backup.start({ ...backupOptions, tables: selectedTables })
    set({ backupJobId: result.jobId, backupRunning: true })
  },

  cancelBackup: async () => {
    const { backupJobId } = get()
    if (backupJobId) await window.api.backup.cancel(backupJobId)
    set({ backupRunning: false })
  },

  // Restore actions
  setRestoreStep: (s) => set({ restoreStep: s }),
  setRestoreOptions: (patch) => set(st => ({ restoreOptions: { ...st.restoreOptions, ...patch } })),
  appendRestoreLog: (entry) => set(st => ({ restoreLog: [...st.restoreLog, entry] })),
  resetRestore: () => set({ restoreStep: 1, restoreOptions: { ...defaultRestoreOptions }, restoreLog: [], restoreJobId: null, restoreRunning: false, restoreVerification: null }),

  startRestore: async () => {
    const { restoreOptions } = get()
    const result = await window.api.backup.restoreStart(restoreOptions)
    set({ restoreJobId: result.jobId, restoreRunning: true })
  },

  cancelRestore: async () => {
    const { restoreJobId } = get()
    if (restoreJobId) await window.api.backup.restoreCancel(restoreJobId)
    set({ restoreRunning: false })
  },

  // Chunked restore actions
  setChunkedStep: (s) => set({ chunkedStep: s }),
  setChunkedOptions: (patch) => set(st => ({ chunkedOptions: { ...st.chunkedOptions, ...patch } })),
  appendChunkedLog: (entry) => set(st => ({ chunkedLog: [...st.chunkedLog, entry] })),
  resetChunked: () => set({ chunkedStep: 1, chunkedOptions: { ...defaultChunkedOptions }, chunkedLog: [], chunkedJobId: null, chunkedRunning: false }),

  startChunked: async () => {
    const { chunkedOptions } = get()
    const result = await window.api.backup.restoreChunked(chunkedOptions)
    set({ chunkedJobId: result.jobId, chunkedRunning: true, chunkedOptions: { ...chunkedOptions, resumeFromRow: result.resumeFromRow } })
  },

  cancelChunked: async () => {
    const { chunkedJobId } = get()
    if (chunkedJobId) await window.api.backup.restoreCancel(chunkedJobId)
    set({ chunkedRunning: false })
  },

  handleProgress: (event) => {
    const st = get()
    const entry = { level: event.level || 'info', message: event.message, rowsDone: event.rowsDone, rowsTotal: event.rowsTotal }

    if (event.jobId === st.backupJobId) {
      st.appendBackupLog(entry)
      if (event.done) set({ backupRunning: false })
    } else if (event.jobId === st.restoreJobId) {
      st.appendRestoreLog(entry)
      if (event.done) {
        set({ restoreRunning: false, restoreVerification: event.verification ?? null })
      }
    } else if (event.jobId === st.chunkedJobId) {
      st.appendChunkedLog(entry)
      if (event.done) set({ chunkedRunning: false })
    }
  }
}))
