import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { secretName } from '../src/vault/index.ts'
import LocalVault from '../src/vault-local/index.ts'
import { MemoryCredentials } from './support/memory-credentials.ts'

async function mount(config: { minValueLength?: number; maxSecrets?: number } = {}) {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  const store = ctx.get('credentials') as unknown as MemoryCredentials
  const fiber = await ctx.plugin(LocalVault, { minValueLength: 8, maxSecrets: 256, ...config })
  return { ctx, store, fiber }
}

describe('local vault', () => {
  it('stores a user secret in the friendly record form and lists it without the value', async () => {
    const { ctx, store } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'postgres://u:p@h/db')
    expect(store.records.get('vault/db-url')).toEqual({ kind: 'api-key', key: 'postgres://u:p@h/db' })
    expect(await ctx.vault.list()).toEqual([{ name: 'DB_URL', origin: 'user' }])
    expect(JSON.stringify(await ctx.vault.list())).not.toContain('postgres')
  })

  it('generates a secret, and refuses to overwrite an existing name', async () => {
    const { ctx, store } = await mount()
    await ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' })
    const record = store.records.get('vault/session-key') as { kind: string; payload: { value: string; origin: string } }
    expect(record.kind).toBe('grant')
    expect(record.payload.value).toMatch(/^[0-9a-f]{32}$/)
    expect(record.payload.origin).toBe('generated')
    await expect(ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' })).rejects.toThrow('already exists')
    expect((store.records.get('vault/session-key') as typeof record).payload.value).toBe(record.payload.value)
    expect(await ctx.vault.list()).toEqual([{ name: 'SESSION_KEY', origin: 'generated' }])
  })

  it('rejects values too short to redact reliably', async () => {
    const { ctx } = await mount()
    await expect(ctx.vault.set(secretName('PIN'), '1234')).rejects.toThrow('at least 8 characters')
    await expect(ctx.vault.generate(secretName('PIN'), { length: 4, alphabet: 'hex' })).rejects.toThrow('at least 8 characters')
  })

  it('enforces the secret limit', async () => {
    const { ctx } = await mount({ maxSecrets: 1 })
    await ctx.vault.set(secretName('ONE'), 'value-one-123')
    await expect(ctx.vault.set(secretName('TWO'), 'value-two-123')).rejects.toThrow('already holds 1 secrets')
    await ctx.vault.set(secretName('ONE'), 'value-one-456')
  })

  it('resolves values for a command and names every missing secret', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('A_KEY'), 'aaaaaaaa1')
    const values = await ctx.vault.resolveForExecution([secretName('A_KEY')])
    expect([...values]).toEqual([['A_KEY', 'aaaaaaaa1']])
    await expect(ctx.vault.resolveForExecution([secretName('A_KEY'), secretName('B_KEY'), secretName('C_KEY')])).rejects.toThrow('not in the vault: B_KEY, C_KEY')
  })

  it('follows hand edits of the credential file, ignoring unusable records', async () => {
    const { ctx, store } = await mount()
    const changed = vi.fn()
    ctx.on('vault/changed', changed)
    store.editRecord('vault/api-token', { kind: 'api-key', key: 'tok-12345678' })
    store.editRecord('vault/short', { kind: 'api-key', key: 'abc' })
    store.editRecord('other/thing', { kind: 'api-key', key: 'not-a-vault-entry' })
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries()).toEqual([{ name: 'API_TOKEN', value: 'tok-12345678', origin: 'user' }]) })
    expect(changed).toHaveBeenCalled()
    await expect(ctx.vault.resolveForExecution([secretName('SHORT')])).rejects.toThrow('not in the vault: SHORT')
    store.editRecord('vault/api-token', undefined)
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries()).toEqual([]) })
  })

  it('removes a secret', async () => {
    const { ctx, store } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'postgres://x')
    await ctx.vault.unset(secretName('DB_URL'))
    expect(store.records.has('vault/db-url')).toBe(false)
    expect(await ctx.vault.list()).toEqual([])
  })

  it('is empty and read-only without a credential store', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalVault, { minValueLength: 8, maxSecrets: 256 })
    expect(await ctx.vault.list()).toEqual([])
    await expect(ctx.vault.set(secretName('DB_URL'), 'postgres://x')).rejects.toThrow('no credential store')
    await expect(ctx.vault.resolveForExecution([secretName('DB_URL')])).rejects.toThrow('not in the vault: DB_URL')
  })

  it('removes the service on dispose', async () => {
    const { ctx, fiber } = await mount()
    await fiber.dispose()
    expect(ctx.get('vault')).toBeUndefined()
  })
})
