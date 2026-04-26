import { useState } from 'react'
import './ResultsGrid.css'

function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(columns, rows) {
  const header = columns.join(',')
  const body = rows.map(row => columns.map(c => csvEscape(row[c])).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsGrid({ results, limitRows, onToggleLimit }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const toolbar = (
    <div className="results-toolbar">
      <label className="limit-label">
        <input type="checkbox" checked={limitRows} onChange={onToggleLimit} />
        Limit 50 rows
      </label>
    </div>
  )

  if (!results) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-message">Run a query to see results</div>
      </div>
    )
  }

  if (results.error) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-error">{results.error}</div>
      </div>
    )
  }

  const { columns, rows } = results

  if (columns.length === 0) {
    return (
      <div className="results-pane">
        {toolbar}
        <div className="results-message">{results.rowCount} row(s) affected</div>
      </div>
    )
  }

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  return (
    <div className="results-pane">
      <div className="results-toolbar">
        <label className="limit-label">
          <input type="checkbox" checked={limitRows} onChange={onToggleLimit} />
          Limit 50 rows
        </label>
        <button className="csv-btn" onClick={() => downloadCsv(columns, sortedRows)}>
          ⬇ CSV
        </button>
      </div>
      <div className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} onClick={() => handleSort(col)}>
                  {col}
                  {sortCol === col && (
                    <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                {columns.map(col => (
                  <td key={col}>
                    {row[col] === null || row[col] === undefined
                      ? <span className="null-val">NULL</span>
                      : String(row[col])
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
