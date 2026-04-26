import { useEffect } from 'react'
import { useConnectionStore } from '../../stores/useConnectionStore'
import { useBackupStore } from '../../stores/useBackupStore'
import ConnectionTree from './ConnectionTree'
import './Sidebar.css'

export default function Sidebar() {
  const { connections, loadConnections } = useConnectionStore()
  const { openWizard } = useBackupStore()

  useEffect(() => { loadConnections() }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-tree">
        <div className="sidebar-section-label">Connections</div>
        {connections.map(conn => (
          <ConnectionTree key={conn.id} connection={conn} />
        ))}
        {connections.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>
            No connections yet.
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-backup-link" onClick={() => openWizard('backup')}>
          💾 Backup / Restore
        </div>
      </div>
    </aside>
  )
}
