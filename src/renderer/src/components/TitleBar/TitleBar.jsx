import { useState } from 'react'
import ConnectionDialog from '../ConnectionDialog/ConnectionDialog'

export default function TitleBar() {
  const [showDialog, setShowDialog] = useState(false)

  return (
    <div style={{
      gridArea: 'titlebar',
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      userSelect: 'none'
    }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>MyMariaDB</span>
      <button
        onClick={() => setShowDialog(true)}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          padding: '3px 10px',
          borderRadius: '3px',
          fontSize: '12px'
        }}
      >
        + New Connection
      </button>
      {showDialog && <ConnectionDialog onClose={() => setShowDialog(false)} />}
    </div>
  )
}
