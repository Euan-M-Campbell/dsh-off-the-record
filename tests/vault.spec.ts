import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { isCredentialKeySegment } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it } from 'vitest'
import { nameFromRecordId, nameFromWorkspaceRecordId, recordId, secretName, secretNameProblem, workspaceDirectory, workspaceRecordId } from '../src/vault/index.ts'
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

describe('workspace scope keys', () => {
  it('canonicalizes a directory through symlinks, and keeps a missing one absolute', () => {
    const realpath = (path: string) => realpathSync.native(path)
    const real = mkdtempSync(join(tmpdir(), 'otr-ws-'))
    const link = `${real}-link`
    symlinkSync(real, link)
    expect(workspaceDirectory(link)).toBe(realpath(real))
    expect(workspaceDirectory(join(dirname(real), '..', basename(dirname(real)), basename(real)))).toBe(realpath(real))
    expect(workspaceDirectory('/no/such/dir/anywhere')).toBe(resolve('/no/such/dir/anywhere'))
  })

  it('names a workspace record by directory hash and secret name, and reads the name back', () => {
    const id = workspaceRecordId('/work/shop' as never, secretName('DB_URL'))
    expect(id).toMatch(/^d[0-9a-f]{16}-db-url$/)
    expect(isCredentialKeySegment(id)).toBe(true)
    expect(workspaceRecordId('/work/blog' as never, secretName('DB_URL'))).not.toBe(id)
    expect(nameFromWorkspaceRecordId(id)).toBe('DB_URL')
    expect(nameFromWorkspaceRecordId('db-url')).toBeUndefined()
  })
})
