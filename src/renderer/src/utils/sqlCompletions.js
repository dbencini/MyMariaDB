const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'VIEW', 'INDEX', 'DATABASE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'MODIFY',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL', 'AS',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'AUTO_INCREMENT', 'NOT NULL',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
  'SHOW', 'DATABASES', 'TABLES', 'COLUMNS', 'USE', 'DESCRIBE', 'EXPLAIN',
  'PROCEDURE', 'FUNCTION', 'TRIGGER', 'IF', 'WHILE', 'CALL',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL', 'NULLIF', 'CAST', 'CONVERT',
  'NOW', 'CURDATE', 'CURTIME', 'DATE', 'YEAR', 'MONTH', 'DAY',
  'CONCAT', 'SUBSTRING', 'LENGTH', 'TRIM', 'UPPER', 'LOWER', 'REPLACE', 'LIKE',
  'ASC', 'DESC', 'TRUE', 'FALSE'
]

let _context = { connectionId: null, database: null }
const _tableCache = new Map()

export function setCompletionContext(connectionId, database) {
  _context = { connectionId, database }
}

async function fetchTables(connectionId, database) {
  const key = `${connectionId}:${database}`
  if (_tableCache.has(key)) return _tableCache.get(key)
  try {
    const objects = await window.api.schema.listObjects(connectionId, database)
    const tables = objects.map(o => ({ name: o.name, type: o.object_type }))
    _tableCache.set(key, tables)
    return tables
  } catch {
    return []
  }
}

export function registerSqlCompletions(monaco) {
  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: async (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const suggestions = SQL_KEYWORDS.map(kw => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
        range
      }))

      const { connectionId, database } = _context
      if (connectionId && database) {
        const tables = await fetchTables(connectionId, database)
        for (const t of tables) {
          suggestions.push({
            label: t.name,
            detail: t.type === 'BASE TABLE' ? 'table' : t.type.toLowerCase(),
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range
          })
        }
      }

      return { suggestions }
    }
  })
}
