import { useState } from 'react'
import { useConnectionStore } from '../../stores/useConnectionStore'
import './ConnectionDialog.css'

const DEFAULT_PORTS = { mysql: 3306, mariadb: 3306, mssql: 1433 }

export default function ConnectionDialog({ onClose, existing = null }) {
  const { createConnection, updateConnection } = useConnectionStore()
  const [form, setForm] = useState(existing ?? {
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: '',
    ssl: false
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [field]: value }
      if (field === 'type') next.port = DEFAULT_PORTS[value]
      return next
    })
  }

  const handleSave = async () => {
    if (!form.name || !form.host || !form.username) {
      setError('Name, host, and username are required.')
      return
    }
    setSaving(true)
    try {
      if (existing) {
        await updateConnection(existing.id, form)
      } else {
        await createConnection(form)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>{existing ? 'Edit Connection' : 'New Connection'}</h2>

        <div className="field">
          <label>Connection Name</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. prod-mysql" />
        </div>

        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={set('type')}>
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="mssql">MSSQL (SQL Server)</option>
          </select>
        </div>

        <div className="field field-row">
          <div className="field" style={{ margin: 0 }}>
            <label>Host</label>
            <input value={form.host} onChange={set('host')} placeholder="localhost" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Port</label>
            <input type="number" value={form.port} onChange={set('port')} />
          </div>
        </div>

        <div className="field">
          <label>Database (optional)</label>
          <input value={form.database} onChange={set('database')} placeholder="default database" />
        </div>

        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={set('username')} />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} />
        </div>

        {form.type !== 'mssql' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={!!form.ssl}
              onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))}
            />
            Use SSL (required for most external servers)
          </label>
        )}

        {error && <div className="error-msg">{error}</div>}

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
