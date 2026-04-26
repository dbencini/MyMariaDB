import { useState } from 'react'

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
    groups[label].push(obj.name)
  }
  return groups
}

function ObjectGroup({ label, items }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 36 }} onClick={() => setOpen(o => !o)}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-string)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({items.length})</span>
      </div>
      {open && (
        <div className="tree-children">
          {items.map(name => (
            <div key={name} className="tree-item" style={{ paddingLeft: 48, color: 'var(--text-secondary)' }}>
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DatabaseNode({ connectionId, dbName }) {
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
            <ObjectGroup key={label} label={label} items={items} />
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

  const handleToggle = async () => {
    if (!open && databases === null) {
      setStatus('connecting')
      try {
        const dbs = await window.api.schema.listDatabases(connection.id)
        setDatabases(dbs)
        setStatus('connected')
      } catch {
        setStatus('error')
        setDatabases([])
      }
    }
    setOpen(o => !o)
  }

  return (
    <div>
      <div className="tree-item" onClick={handleToggle}>
        <span className="arrow">{open ? '▼' : '▶'}</span>
        <span className={`status-dot ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'idle'}`} />
        <span style={{ color: 'var(--text-type)' }}>{connection.name}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 4 }}>({connection.type})</span>
      </div>
      {open && databases !== null && (
        <div className="tree-children">
          {databases.map(db => (
            <DatabaseNode key={db} connectionId={connection.id} dbName={db} />
          ))}
        </div>
      )}
    </div>
  )
}
