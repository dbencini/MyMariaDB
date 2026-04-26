export default function App() {
  return (
    <div className="app-shell">
      <div style={{ gridArea: 'titlebar', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        MyMariaDB
      </div>
      <div style={{ gridArea: 'sidebar', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }} />
      <div style={{ gridArea: 'main', background: 'var(--bg-base)' }} />
      <div style={{ gridArea: 'statusbar', background: 'var(--status-bar-bg)', color: 'var(--status-bar-text)' }} />
    </div>
  )
}
