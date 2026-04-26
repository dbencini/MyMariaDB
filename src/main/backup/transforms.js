export function replaceCollations(sql) {
  return sql
    .replace(/utf8mb4_0900_as_cs/g, 'utf8mb4_bin')
    .replace(/utf8mb4_0900_as_ci/g, 'utf8mb4_unicode_ci')
    .replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_general_ci')
}

export function removeInvisible(sql) {
  return sql.replace(/\bINVISIBLE\b/gi, '')
}

export function removeVersionGatedComments(sql) {
  return sql.replace(/\/\*!8\d{4}[\s\S]*?\*\//g, '')
}

export function unwrapExpressionDefaults(sql) {
  return sql.replace(/DEFAULT\s+\(([^()]*)\)/gi, 'DEFAULT $1')
}

export function applyAll(sql) {
  return unwrapExpressionDefaults(
    removeVersionGatedComments(
      removeInvisible(
        replaceCollations(sql)
      )
    )
  )
}
