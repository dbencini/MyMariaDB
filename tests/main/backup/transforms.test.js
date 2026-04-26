import { describe, it, expect } from 'vitest'
import {
  replaceCollations,
  removeInvisible,
  removeVersionGatedComments,
  unwrapExpressionDefaults,
  applyAll
} from '../../../src/main/backup/transforms.js'

describe('replaceCollations', () => {
  it('replaces utf8mb4_0900_ai_ci with utf8mb4_general_ci', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_ai_ci'))
      .toBe('COLLATE utf8mb4_general_ci')
  })
  it('replaces utf8mb4_0900_as_cs with utf8mb4_bin', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_as_cs'))
      .toBe('COLLATE utf8mb4_bin')
  })
  it('replaces utf8mb4_0900_as_ci with utf8mb4_unicode_ci', () => {
    expect(replaceCollations('COLLATE utf8mb4_0900_as_ci'))
      .toBe('COLLATE utf8mb4_unicode_ci')
  })
  it('leaves unrelated collations unchanged', () => {
    expect(replaceCollations('COLLATE utf8mb4_general_ci'))
      .toBe('COLLATE utf8mb4_general_ci')
  })
})

describe('removeInvisible', () => {
  it('removes INVISIBLE keyword', () => {
    expect(removeInvisible('`col` INT INVISIBLE DEFAULT NULL'))
      .toBe('`col` INT  DEFAULT NULL')
  })
  it('is case-insensitive', () => {
    expect(removeInvisible('`col` INT invisible')).toBe('`col` INT ')
  })
})

describe('removeVersionGatedComments', () => {
  it('removes /*!80023 ... */ comments', () => {
    expect(removeVersionGatedComments('CREATE /*!80023 INVISIBLE */ TABLE'))
      .toBe('CREATE  TABLE')
  })
  it('removes multi-token version comments', () => {
    expect(removeVersionGatedComments('a /*!80016 DEFAULT_GENERATED */ b'))
      .toBe('a  b')
  })
  it('leaves normal comments unchanged', () => {
    expect(removeVersionGatedComments('/* regular comment */')).toBe('/* regular comment */')
  })
})

describe('unwrapExpressionDefaults', () => {
  it('unwraps DEFAULT (literal)', () => {
    expect(unwrapExpressionDefaults('col INT DEFAULT (42)'))
      .toBe('col INT DEFAULT 42')
  })
  it('unwraps DEFAULT (string literal)', () => {
    expect(unwrapExpressionDefaults("col VARCHAR(10) DEFAULT ('hi')"))
      .toBe("col VARCHAR(10) DEFAULT 'hi'")
  })
  it('does not unwrap nested parens', () => {
    const sql = 'col INT DEFAULT (a + b)'
    expect(unwrapExpressionDefaults(sql)).toBe('col INT DEFAULT a + b')
  })
})

describe('applyAll', () => {
  it('applies all transforms in sequence', () => {
    const input = '`col` INT INVISIBLE COLLATE utf8mb4_0900_ai_ci /*!80023 x */ DEFAULT (1)'
    const result = applyAll(input)
    expect(result).toContain('utf8mb4_general_ci')
    expect(result).not.toMatch(/\bINVISIBLE\b/i)
    expect(result).not.toContain('/*!80023')
    expect(result).toContain('DEFAULT 1')
  })
})
