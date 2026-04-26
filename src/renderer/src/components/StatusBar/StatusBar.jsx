export default function StatusBar({ message = 'Ready' }) {
  return (
    <div style={{
      gridArea: 'statusbar',
      background: 'var(--status-bar-bg)',
      color: 'var(--status-bar-text)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      fontSize: '11px',
      gap: '12px'
    }}>
      <span>{message}</span>
    </div>
  )
}
