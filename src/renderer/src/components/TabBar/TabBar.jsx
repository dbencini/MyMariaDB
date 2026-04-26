import { useState } from 'react'
import { useTabStore } from '../../stores/useTabStore'
import './TabBar.css'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, updateTabTitle } = useTabStore()
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const startRename = (e, tab) => {
    e.stopPropagation()
    setEditingId(tab.id)
    setEditTitle(tab.title)
  }

  const commitRename = (id) => {
    if (editTitle.trim()) updateTabTitle(id, editTitle.trim())
    setEditingId(null)
  }

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={(e) => startRename(e, tab)}
        >
          {editingId === tab.id ? (
            <input
              className="tab-rename-input"
              value={editTitle}
              autoFocus
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => commitRename(tab.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(tab.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="tab-title">{tab.title}</span>
          )}
          {tab.running && <span className="tab-running">●</span>}
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
          >×</button>
        </div>
      ))}
      <button className="tab-add" onClick={() => addTab()}>+</button>
    </div>
  )
}
