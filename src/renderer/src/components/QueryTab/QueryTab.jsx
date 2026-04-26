import { useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useTabStore } from '../../stores/useTabStore'
import { useConnectionStore } from '../../stores/useConnectionStore'
import { setCompletionContext } from '../../utils/sqlCompletions'
import ResultsGrid from '../ResultsGrid/ResultsGrid'
import './QueryTab.css'

export default function QueryTab({ tabId }) {
  const { tabs, updateTabSql, runTab, toggleTabLimit } = useTabStore()
  const { connections } = useConnectionStore()
  const editorRef = useRef(null)

  const tab = tabs.find(t => t.id === tabId)

  useEffect(() => {
    if (tab?.connectionId && tab?.database) {
      setCompletionContext(tab.connectionId, tab.database)
    }
  }, [tab?.connectionId, tab?.database])

  if (!tab) return null

  const connection = connections.find(c => c.id === tab.connectionId)
  const contextLabel = tab.database && connection
    ? `${tab.database}  @  ${connection.name}`
    : 'No connection — open a connection from the sidebar'

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyCode.F5],
      run: () => runTab(tabId)
    })
  }

  const handleFormat = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run()
  }

  return (
    <div className="query-tab">
      <div className="query-context-bar">{contextLabel}</div>

      <div className="query-editor-section">
        <div className="query-editor-toolbar">
          <button
            className="run-btn"
            onClick={() => runTab(tabId)}
            disabled={tab.running || !tab.connectionId}
          >
            {tab.running ? '⏳ Running…' : '▶ Run (F5)'}
          </button>
          <button className="format-btn" onClick={handleFormat}>Format</button>
        </div>
        <div className="query-editor-monaco">
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={tab.sql}
            onChange={val => updateTabSql(tabId, val ?? '')}
            onMount={handleMount}
            options={{
              lineNumbers: 'on',
              minimap: { enabled: false },
              wordWrap: 'off',
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true
            }}
          />
        </div>
      </div>

      <div className="query-results-section">
        <ResultsGrid
          results={tab.results}
          limitRows={tab.limitRows}
          onToggleLimit={() => toggleTabLimit(tabId)}
        />
      </div>
    </div>
  )
}
