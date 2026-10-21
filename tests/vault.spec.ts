import { describe, expect, it } from 'vitest'
import { nameFromRecordId, recordId, secretName, secretNameProblem } from '../src/vault/index.ts'
import { randomSecret, readEntry } from '../src/vault-local/index.ts'

describe('secret names', () => {
  it.each(['DB_URL', 'API_KEY_2', 'X1', 'SESSION_KEY'])('accepts %s', (name) => {
    expect(secretNameProblem(name)).toBeUndefined()
  })

  it.each([
    ['db_url', 'not a valid secret name'],
    ['_PRIVATE', 'not a valid secret name'],
    ['9LIVES', 'not a valid secret name'],
    ['DB-URL', 'not a valid secret name'],
    ['', 'not a valid secret name'],
    ['PATH', 'reserved'],
    ['HOME', 'reserved'],
    ['NODE_OPTIONS', 'reserved'],
    ['BASH_ENV', 'reserved'],
    ['LD_PRELOAD', 'reserved'],
    ['DYLD_INSERT_LIBRARIES', 'reserved'],
    ['DSH_ANYTHING', 'reserved'],
    ['GIT_SSH_COMMAND', 'reserved'],
    ['A'.repeat(129), 'longer than 128'],
  ])('rejects %s', (name, problem) => {
    expect(secretNameProblem(name)).toContain(problem)
    expect(() => secretName(name)).toThrow(problem)
  })

  it('maps names to credential record ids and back', () => {
    expect(recordId(secretName('DB_URL'))).toBe('db-url')
    expect(nameFromRecordId('db-url')).toBe('DB_URL')
    expect(nameFromRecordId('session-key-2')).toBe('SESSION_KEY_2')
    expect(nameFromRecordId('path')).toBeUndefined()
    expect(nameFromRecordId('1abc')).toBeUndefined()
  })
})

describe('generated secrets', () => {
  it.each([
    ['hex', /^[0-9a-f]{40}$/],
    ['base64url', /^[A-Za-z0-9_-]{40}$/],
    ['alphanumeric', /^[A-Za-z0-9]{40}$/],
  ] as const)('draws %s characters', (alphabet, pattern) => {
    const values = new Set(Array.from({ length: 20 }, () => randomSecret({ length: 40, alphabet })))
    expect(values.size).toBe(20)
    for (const value of values) expect(value).toMatch(pattern)
  })
})

describe('vault records', () => {
  it('reads a hand-written api-key record as a user secret', () => {
    expect(readEntry({ kind: 'api-key', key: 'postgres://u:p@h/db' })).toEqual({ value: 'postgres://u:p@h/db', origin: 'user' })
  })

  it('reads a generated grant record', () => {
    expect(readEntry({ kind: 'grant', payload: { value: 'abcdefgh12345678', origin: 'generated', createdAt: '2026-10-21T00:00:00Z' } }))
      .toEqual({ value: 'abcdefgh12345678', origin: 'generated' })
  })

  it('ignores records with no value', () => {
    expect(readEntry(undefined)).toBeUndefined()
    expect(readEntry({ kind: 'api-key' })).toBeUndefined()
    expect(readEntry({ kind: 'api-key', key: '' })).toBeUndefined()
    expect(readEntry({ kind: 'grant', payload: { token: 'x' } })).toBeUndefined()
    expect(readEntry({ kind: 'grant', payload: null })).toBeUndefined()
  })
})
