import { useState, useEffect } from 'react'
import { useTabStore } from '../../stores/useTabStore'
import ConnectionDialog from '../ConnectionDialog/ConnectionDialog'

const OBJECT_TYPE_LABELS = {
  'BASE TABLE': 'Tables',
  'VIEW': 'Views',
  'PROCEDURE': 'Stored Procs',
  'FUNCTION': 'Functions',
  'TRIGGER': 'Triggers'
}

function groupObjects(objects) {
  const groups = {}
  for (const obj of objects) {
    const label = OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type
    if (!groups[label]) groups[label] = []
    groups[label].push({ name: obj.name, type: obj.object_type })
  }
  return groups
}

function ContextMenu({ x, y, onPreview, onNewQuery, onClose }) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: 9999,
      background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
      borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      minWidth: 160, fontSize: 12
    }}>
      <div
        style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={e => { e.stopPropagation(); onPreview() }}
      >
        📋 Preview data
      </div>
      <div
        style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={e => { e.stopPropagation(); onNewQuery() }}
      >
        + New Query Tab
      </div>
    </div>
  )
}

function ConnectionStatusModal({ connection, status, error, onDismiss, onEdit }) {
  if (status !== 'connecting' && status !== 'error') return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
        borderRadius: 6, width: 380, padding: 20
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
          {status === 'connecting' ? `Connecting to ${connection.name}…` : `Connection failed`}
        </div>

        {status === 'connecting' && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {connection.type.toUpperCase()} · {connection.host}:{connection.port}
          </div>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {connection.type.toUpperCase()} · {connection.host}:{connection.port}
            </div>
            <div style={{
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '8px 10px', fontSize: 12,
              color: 'var(--text-error)', fontFamily: 'monospace',
              wordBreak: 'break-word', marginBottom: 16
            }}>
              {error}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onDismiss}
                style={{
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  padding: '5px 14px', borderRadius: 3, fontSize: 12
                }}
              >
                Dismiss
              </button>
              <button
                onClick={onEdit}
                style={{
                  background: 'var(--accent)', color: '#fff',
                  padding: '5px 14px', borderRadius: 3, fontSize: 12
                }}
              >
                Edit Connection
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ObjectGroup({ label, items, connectionId, database, connectionType }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const { addAndRunTab, addTab } = useTabStore()
  const isTable = label === 'Tables'

  const handleContextMenu = (e, item) => {
    if (!isTable) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, item })
  }

  const handlePreview = (item) => {
    const sql = connectionType === 'mssql'
      ? `SELECT * FROM [${item.name}]`
      : `SELECT * FROM \`${item.name}\``
    addAndRunTab({ title: `📋 ${item.name}`, sql, connectionId, database })
    setMenu(null)
  }

  const handleNewQuery = () => {
    addTab({ connectionId, database })
    setMenu(null)
  }

  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 36 }} onClick={() => setOpen(o => !o)}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-string)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({items.length})</span>
      </div>
      {open && (
        <div className="tree-children">
          {items.map(item => (
            <div
              key={item.name}
              className="tree-item"
              style={{ paddingLeft: 48, color: 'var(--text-secondary)' }}
              onContextMenu={e => handleContextMenu(e, item)}
            >
              {item.name}
              {isTable && (
                <button
                  className="preview-btn"
                  title="Preview data"
                  onClick={e => { e.stopPropagation(); handlePreview(item) }}
                >🔍</button>
              )}
            </div>
          ))}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          onPreview={() => handlePreview(menu.item)}
          onNewQuery={handleNewQuery}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function DatabaseNode({ connectionId, dbName, connectionType }) {
  const [open, setOpen] = useState(false)
  const [objects, setObjects] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (!open && objects === null) {
      setLoading(true)
      try {
        const list = await window.api.schema.listObjects(connectionId, dbName)
        setObjects(list)
      } catch { setObjects([]) }
      finally { setLoading(false) }
    }
    setOpen(o => !o)
  }

  const groups = objects ? groupObjects(objects) : {}

  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 24 }} onClick={handleToggle}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-accent)' }}>{dbName}</span>
        {loading && <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}> loading…</span>}
      </div>
      {open && objects !== null && (
        <div className="tree-children">
          {Object.entries(groups).map(([label, items]) => (
            <ObjectGroup
              key={label}
              label={label}
              items={items}
              connectionId={connectionId}
              database={dbName}
              connectionType={connectionType}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConnectionTree({ connection }) {
  const [open, setOpen] = useState(false)
  const [databases, setDatabases] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [showEdit, setShowEdit] = useState(false)

  const connect = async () => {
    setStatus('connecting')
    setError(null)
    try {
      const dbs = await window.api.schema.listDatabases(connection.id)
      setDatabases(dbs)
      setStatus('connected')
      setOpen(true)
    } catch (err) {
      setStatus('error')
      setError(err?.message ?? String(err))
      setOpen(false)
    }
  }

  const handleToggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    if (databases !== null && status === 'connected') {
      setOpen(true)
      return
    }
    await connect()
  }

  const handleDismiss = () => {
    setStatus('idle')
    setError(null)
  }

  const handleEditClose = () => {
    setShowEdit(false)
    setStatus('idle')
    setError(null)
    setDatabases(null)
    setOpen(false)
  }

  return (
    <div>
      <div className="tree-item" onClick={handleToggle}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span className={`status-dot ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'idle'}`} />
        <span style={{ color: 'var(--text-type)' }}>{connection.name}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({connection.type})</span>
        <button
          className="preview-btn"
          title="Edit connection"
          onClick={e => { e.stopPropagation(); setShowEdit(true) }}
        >⚙</button>
      </div>

      {open && databases !== null && (
        <div className="tree-children">
          {databases.map(db => (
            <DatabaseNode
              key={db}
              connectionId={connection.id}
              dbName={db}
              connectionType={connection.type}
            />
          ))}
        </div>
      )}

      <ConnectionStatusModal
        connection={connection}
        status={status}
        error={error}
        onDismiss={handleDismiss}
        onEdit={() => setShowEdit(true)}
      />

      {showEdit && (
        <ConnectionDialog
          existing={connection}
          onClose={handleEditClose}
        />
      )}
    </div>
  )
}
