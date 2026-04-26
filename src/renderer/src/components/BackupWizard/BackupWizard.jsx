import { useEffect, useRef } from 'react'
import { useBackupStore } from '../../stores/useBackupStore'
import { useConnectionStore } from '../../stores/useConnectionStore'
import './BackupWizard.css'

// ── Backup Tab ───────────────────────────────────────────────────────────────

function BackupTab() {
  const {
    backupStep, setBackupStep,
    backupOptions, setBackupOptions, toggleTable,
    backupLog,
    backupRunning,
    startBackup, cancelBackup, resetBackup
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [backupLog])

  const mysqlConns = connections.filter(c => c.type !== 'mssql')
  const mssqlConns = connections.filter(c => c.type === 'mssql')

  const loadTables = async (connectionId, database) => {
    if (!connectionId || !database) return
    const rows = await window.api.backup.getTables({ connectionId, database })
    setBackupOptions({ tables: rows.map(r => ({ ...r, selected: true })) })
  }

  const selectedCount = backupOptions.tables.filter(t => t.selected).length

  const steps = ['Source', 'Content', 'Output', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${backupStep === i + 1 ? 'active' : backupStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {backupStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Connection</label>
            <select className="bw-select" value={backupOptions.connectionId ?? ''}
              onChange={e => { setBackupOptions({ connectionId: e.target.value, database: null, tables: [] }) }}>
              <option value="">— select —</option>
              {mysqlConns.length > 0 && <optgroup label="MySQL / MariaDB">
                {mysqlConns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </optgroup>}
              {mssqlConns.length > 0 && <optgroup label="MSSQL (same-to-same only)">
                {mssqlConns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </optgroup>}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Database</label>
            <input className="bw-input" placeholder="Database name"
              value={backupOptions.database ?? ''}
              onChange={e => setBackupOptions({ database: e.target.value, tables: [] })}
              onBlur={() => loadTables(backupOptions.connectionId, backupOptions.database)} />
          </div>
        </div>
      )}

      {backupStep === 2 && (
        <div>
          <div className="bw-section">
            <label className="bw-label">Tables ({selectedCount}/{backupOptions.tables.length} selected)</label>
            <div className="bw-table-list">
              {backupOptions.tables.map(t => (
                <div key={t.name} className={`bw-table-row ${t.rowCount > 100000 ? 'large' : ''}`}>
                  <input type="checkbox" checked={t.selected} onChange={() => toggleTable(t.name)} />
                  <span className="bw-table-name">{t.name}</span>
                  <span className="bw-table-count">{t.rowCount?.toLocaleString()} rows</span>
                  {t.rowCount > 100000 && <span className="bw-large-badge">large</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="bw-section">
            <label className="bw-label">Mode</label>
            <div className="bw-radio-group">
              {['schema+data', 'schema', 'data'].map(m => (
                <label key={m} className="bw-radio-label">
                  <input type="radio" name="mode" value={m}
                    checked={backupOptions.mode === m}
                    onChange={() => setBackupOptions({ mode: m })} />
                  {m === 'schema+data' ? 'Schema + Data' : m === 'schema' ? 'Schema only' : 'Data only'}
                </label>
              ))}
            </div>
          </div>
          <div className="bw-section">
            <label className="bw-checkbox-label">
              <input type="checkbox" checked={backupOptions.includeObjects}
                onChange={e => setBackupOptions({ includeObjects: e.target.checked })} />
              Include objects (views, procedures, triggers, functions)
            </label>
          </div>
        </div>
      )}

      {backupStep === 3 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Output path (.sql)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={backupOptions.outputPath}
              onChange={e => setBackupOptions({ outputPath: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label">Format</label>
            <div className="bw-format-group">
              {[['sql', 'SQL file'], ['zip', 'ZIP file'], ['both', 'Both']].map(([v, l]) => (
                <label key={v} className="bw-radio-label">
                  <input type="radio" name="format" value={v}
                    checked={backupOptions.format === v}
                    onChange={() => setBackupOptions({ format: v })} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {backupStep === 4 && (
        <div>
          <div className="bw-log" ref={logRef}>
            {backupLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {backupLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : ''}`}>
                {e.message}
                {e.rowsTotal > 0 && ` (${e.rowsDone?.toLocaleString()}/${e.rowsTotal?.toLocaleString()})`}
              </div>
            ))}
          </div>
          {backupLog.length > 0 && backupLog[backupLog.length - 1].rowsTotal > 0 && (
            <div className="bw-progress-bar">
              <div className="bw-progress-fill" style={{
                width: `${Math.round((backupLog[backupLog.length - 1].rowsDone / backupLog[backupLog.length - 1].rowsTotal) * 100)}%`
              }} />
            </div>
          )}
        </div>
      )}

      <div className="bw-footer">
        {backupStep > 1 && !backupRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setBackupStep(backupStep - 1)}>Back</button>
        )}
        {backupStep < 4 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (backupStep === 1 && (!backupOptions.connectionId || !backupOptions.database)) ||
              (backupStep === 2 && selectedCount === 0) ||
              (backupStep === 3 && !backupOptions.outputPath)
            }
            onClick={() => setBackupStep(backupStep + 1)}>
            Next
          </button>
        )}
        {backupStep === 4 && !backupRunning && backupLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startBackup}>Start Backup</button>
        )}
        {backupStep === 4 && backupRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelBackup}>Cancel</button>
        )}
        {backupStep === 4 && !backupRunning && backupLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetBackup}>New Backup</button>
        )}
      </div>
    </div>
  )
}

// ── Restore Tab ──────────────────────────────────────────────────────────────

function RestoreTab() {
  const {
    restoreStep, setRestoreStep,
    restoreOptions, setRestoreOptions,
    restoreLog,
    restoreRunning, restoreVerification,
    startRestore, cancelRestore, resetRestore
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [restoreLog])

  const parseFileHeader = (path) => {
    const name = path.split(/[\\/]/).pop()
    setRestoreOptions({ filePath: path, database: name.replace(/\.(sql|zip)$/, '').replace(/_\d{4}-\d{2}-\d{2}$/, '') })
  }

  const steps = ['File', 'Target', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${restoreStep === i + 1 ? 'active' : restoreStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {restoreStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Backup file (.sql or .zip)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={restoreOptions.filePath}
              onChange={e => parseFileHeader(e.target.value)} />
          </div>
          {restoreOptions.database && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              Detected database: <strong style={{ color: 'var(--text-primary)' }}>{restoreOptions.database}</strong>
            </div>
          )}
        </div>
      )}

      {restoreStep === 2 && (
        <div>
          <div className="bw-warning bw-error-warning">
            <span>⚠</span>
            <span>There is no rollback. If the restore fails partway through, the target database will be left in a partial state. If you need to be able to undo this, take a backup of the target database before continuing.</span>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target connection</label>
            <select className="bw-select" value={restoreOptions.connectionId ?? ''}
              onChange={e => setRestoreOptions({ connectionId: e.target.value })}>
              <option value="">— select —</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target database name</label>
            <input className="bw-input" value={restoreOptions.database}
              onChange={e => setRestoreOptions({ database: e.target.value })} />
          </div>
        </div>
      )}

      {restoreStep === 3 && (
        <div>
          <div className="bw-log" ref={logRef}>
            {restoreLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {restoreLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : ''}`}>{e.message}</div>
            ))}
          </div>
          {restoreVerification && (
            <table className="bw-verify-table">
              <thead><tr><th>Table</th><th>Rows</th><th>Pass</th></tr></thead>
              <tbody>
                {restoreVerification.map(v => (
                  <tr key={v.tableName}>
                    <td>{v.tableName}</td>
                    <td>{v.targetCount?.toLocaleString()}</td>
                    <td className={v.pass ? 'bw-verify-pass' : 'bw-verify-fail'}>
                      {v.pass ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="bw-footer">
        {restoreStep > 1 && !restoreRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setRestoreStep(restoreStep - 1)}>Back</button>
        )}
        {restoreStep < 3 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (restoreStep === 1 && !restoreOptions.filePath) ||
              (restoreStep === 2 && (!restoreOptions.connectionId || !restoreOptions.database))
            }
            onClick={() => setRestoreStep(restoreStep + 1)}>
            Next
          </button>
        )}
        {restoreStep === 3 && !restoreRunning && restoreLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startRestore}>Start Restore</button>
        )}
        {restoreStep === 3 && restoreRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelRestore}>Cancel</button>
        )}
        {restoreStep === 3 && !restoreRunning && restoreLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetRestore}>New Restore</button>
        )}
      </div>
    </div>
  )
}

// ── Chunked Restore Tab ──────────────────────────────────────────────────────

function ChunkedTab() {
  const {
    chunkedStep, setChunkedStep,
    chunkedOptions, setChunkedOptions,
    chunkedLog, chunkedRunning,
    startChunked, cancelChunked, resetChunked
  } = useBackupStore()
  const { connections } = useConnectionStore()
  const logRef = useRef(null)

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [chunkedLog])

  const steps = ['File & Table', 'Target', 'Run']

  return (
    <div>
      <div className="bw-steps">
        {steps.map((s, i) => (
          <span key={s} className={`bw-step ${chunkedStep === i + 1 ? 'active' : chunkedStep > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {chunkedStep === 1 && (
        <div>
          <div className="bw-section">
            <label className="bw-label required">Backup file (.sql or .zip)</label>
            <input className="bw-input" placeholder="C:\Users\...\backup.sql"
              value={chunkedOptions.filePath}
              onChange={e => setChunkedOptions({ filePath: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label required">Table name to restore</label>
            <input className="bw-input" placeholder="users"
              value={chunkedOptions.tableName}
              onChange={e => setChunkedOptions({ tableName: e.target.value })} />
          </div>
          <div className="bw-section">
            <label className="bw-label">Chunk size (rows per batch)</label>
            <input className="bw-input" type="number" min="1000" step="1000"
              value={chunkedOptions.chunkSize}
              onChange={e => setChunkedOptions({ chunkSize: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {chunkedStep === 2 && (
        <div>
          <div className="bw-warning bw-error-warning">
            <span>⚠</span>
            <span>There is no rollback. If the restore fails partway through, the target table will be in a partial state. Take a backup of the target database first if you need to be able to undo this.</span>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target connection</label>
            <select className="bw-select" value={chunkedOptions.connectionId ?? ''}
              onChange={e => setChunkedOptions({ connectionId: e.target.value })}>
              <option value="">— select —</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div className="bw-section">
            <label className="bw-label required">Target database name</label>
            <input className="bw-input" value={chunkedOptions.database}
              onChange={e => setChunkedOptions({ database: e.target.value })} />
          </div>
        </div>
      )}

      {chunkedStep === 3 && (
        <div>
          {chunkedOptions.resumeFromRow > 0 && !chunkedRunning && chunkedLog.length === 0 && (
            <div className="bw-warning">
              <span>ℹ</span>
              <span>Checkpoint found — resuming from row ~{chunkedOptions.resumeFromRow.toLocaleString()}.</span>
            </div>
          )}
          <div className="bw-log" ref={logRef}>
            {chunkedLog.length === 0 && <div className="bw-log-line" style={{ color: 'var(--text-secondary)' }}>Ready to start…</div>}
            {chunkedLog.map((e, i) => (
              <div key={i} className={`bw-log-line ${e.level === 'error' ? 'error' : ''}`}>
                {e.message}
                {e.rowsTotal > 0 && ` (${e.rowsDone?.toLocaleString()}/${e.rowsTotal?.toLocaleString()})`}
              </div>
            ))}
          </div>
          {chunkedLog.length > 0 && chunkedLog[chunkedLog.length - 1].rowsTotal > 0 && (
            <div className="bw-progress-bar">
              <div className="bw-progress-fill" style={{
                width: `${Math.round((chunkedLog[chunkedLog.length - 1].rowsDone / chunkedLog[chunkedLog.length - 1].rowsTotal) * 100)}%`
              }} />
            </div>
          )}
        </div>
      )}

      <div className="bw-footer">
        {chunkedStep > 1 && !chunkedRunning && (
          <button className="bw-btn bw-btn-secondary" onClick={() => setChunkedStep(chunkedStep - 1)}>Back</button>
        )}
        {chunkedStep < 3 && (
          <button className="bw-btn bw-btn-primary"
            disabled={
              (chunkedStep === 1 && (!chunkedOptions.filePath || !chunkedOptions.tableName)) ||
              (chunkedStep === 2 && (!chunkedOptions.connectionId || !chunkedOptions.database))
            }
            onClick={() => setChunkedStep(chunkedStep + 1)}>
            Next
          </button>
        )}
        {chunkedStep === 3 && !chunkedRunning && chunkedLog.length === 0 && (
          <button className="bw-btn bw-btn-primary" onClick={startChunked}>
            {chunkedOptions.resumeFromRow > 0 ? 'Resume Restore' : 'Start Restore'}
          </button>
        )}
        {chunkedStep === 3 && chunkedRunning && (
          <button className="bw-btn bw-btn-danger" onClick={cancelChunked}>Pause</button>
        )}
        {chunkedStep === 3 && !chunkedRunning && chunkedLog.length > 0 && (
          <button className="bw-btn bw-btn-secondary" onClick={resetChunked}>New Restore</button>
        )}
      </div>
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────

export default function BackupWizard() {
  const { open, closeWizard, activeTab, setActiveTab, handleProgress } = useBackupStore()

  useEffect(() => {
    if (!open) return
    const unsub = window.api.backup.onProgress(handleProgress)
    return unsub
  }, [open])

  if (!open) return null

  return (
    <div className="bw-overlay" onClick={e => { if (e.target === e.currentTarget) closeWizard() }}>
      <div className="bw-modal">
        <div className="bw-header">
          <span className="bw-title">💾 Backup / Restore</span>
          <button className="bw-close" onClick={closeWizard}>×</button>
        </div>
        <div className="bw-tabs">
          {[['backup', 'Backup'], ['restore', 'Restore'], ['chunked', 'Chunked Restore']].map(([id, label]) => (
            <button key={id} className={`bw-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="bw-body">
          {activeTab === 'backup' && <BackupTab />}
          {activeTab === 'restore' && <RestoreTab />}
          {activeTab === 'chunked' && <ChunkedTab />}
        </div>
      </div>
    </div>
  )
}
