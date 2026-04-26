import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'

export default function App() {
  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar />
      <main style={{ gridArea: 'main', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Open a connection from the sidebar to begin
        </span>
      </main>
      <StatusBar />
    </div>
  )
}
