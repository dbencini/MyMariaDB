import { useTabStore } from './stores/useTabStore'
import { useConnectionStore } from './stores/useConnectionStore'
import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import TabBar from './components/TabBar/TabBar'
import QueryTab from './components/QueryTab/QueryTab'
import StatusBar from './components/StatusBar/StatusBar'
import BackupWizard from './components/BackupWizard/BackupWizard'

export default function App() {
  const { tabs, activeTabId } = useTabStore()
  const { connections } = useConnectionStore()

  const activeTab = tabs.find(t => t.id === activeTabId)
  const activeConn = connections.find(c => c.id === activeTab?.connectionId)

  let statusLeft = 'Ready'
  let leftError = false
  if (activeTab?.running) {
    statusLeft = 'Running…'
  } else if (activeTab?.results?.error) {
    statusLeft = activeTab.results.error
    leftError = true
  } else if (activeTab?.results?.rowCount !== undefined) {
    const r = activeTab.results
    statusLeft = `✓ ${r.rowCount} row${r.rowCount !== 1 ? 's' : ''} · ${r.durationMs}ms`
  }

  const statusRight = activeConn
    ? [activeConn.host, activeTab?.database, activeTab?.serverVersion].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar />
      <main style={{
        gridArea: 'main',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>
        <TabBar />
        {activeTab
          ? <QueryTab key={activeTabId} tabId={activeTabId} />
          : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13
            }}>
              Open a connection from the sidebar, then press + to start a query
            </div>
          )
        }
      </main>
      <StatusBar left={statusLeft} right={statusRight} leftError={leftError} />
      <BackupWizard />
    </div>
  )
}
