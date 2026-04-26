export default function StatusBar({ left = 'Ready', right = '', leftError = false }) {
  return (
    <div style={{
      gridArea: 'statusbar',
      background: 'var(--status-bar-bg)',
      color: 'var(--status-bar-text)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 10px',
      fontSize: '11px',
      flexShrink: 0,
      gap: '12px'
    }}>
      <span style={leftError ? { color: '#ffcccc' } : {}}>{left}</span>
      {right && <span style={{ opacity: 0.8, marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}
