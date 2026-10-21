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
    expect(await ctx.vault.list()).toEqual([{ name: 'DB_URL', origin: 'user', scope: 'global' }])
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
    expect(await ctx.vault.list()).toEqual([{ name: 'SESSION_KEY', origin: 'generated', scope: 'global' }])
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

describe('workspace secrets', () => {
  const shop = '/work/shop' as never
  const blog = '/work/blog' as never

  it('keeps a workspace secret to its workspace, and lets it replace a global one of the same name', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'global-db-url')
    await ctx.vault.set(secretName('DB_URL'), 'shop-db-url-1', shop)
    await ctx.vault.set(secretName('SHOP_KEY'), 'shop-key-123', shop)
    expect(await ctx.vault.list(shop)).toEqual([
      { name: 'DB_URL', origin: 'user', scope: 'workspace', directory: shop },
      { name: 'SHOP_KEY', origin: 'user', scope: 'workspace', directory: shop },
    ])
    expect(await ctx.vault.list(blog)).toEqual([{ name: 'DB_URL', origin: 'user', scope: 'global' }])
    expect(await ctx.vault.list()).toEqual([{ name: 'DB_URL', origin: 'user', scope: 'global' }])
    expect([...await ctx.vault.resolveForExecution([secretName('DB_URL')], shop)]).toEqual([['DB_URL', 'shop-db-url-1']])
    expect([...await ctx.vault.resolveForExecution([secretName('DB_URL')], blog)]).toEqual([['DB_URL', 'global-db-url']])
    await expect(ctx.vault.resolveForExecution([secretName('SHOP_KEY')], blog)).rejects.toThrow('not in the vault: SHOP_KEY')
    await expect(ctx.vault.resolveForExecution([secretName('SHOP_KEY')])).rejects.toThrow('not in the vault: SHOP_KEY')
  })

  it('lists every scope for configuration surfaces and redacts every scope', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'global-db-url')
    await ctx.vault.set(secretName('DB_URL'), 'shop-db-url-1', shop)
    expect((await ctx.vault.listAll()).map(secret => [secret.name, secret.scope, secret.directory])).toEqual([
      ['DB_URL', 'global', undefined], ['DB_URL', 'workspace', shop],
    ])
    expect(ctx.vault.redactionEntries().map(entry => entry.value).sort()).toEqual(['global-db-url', 'shop-db-url-1'])
  })

  it('stores a workspace secret with its directory, and removes only that scope', async () => {
    const { ctx, store } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'global-db-url')
    await ctx.vault.set(secretName('DB_URL'), 'shop-db-url-1', shop)
    const record = [...store.records].find(([key]) => key.startsWith('vault-ws/'))
    expect(record?.[1]).toMatchObject({ kind: 'grant', payload: { value: 'shop-db-url-1', origin: 'user', directory: shop } })
    await ctx.vault.unset(secretName('DB_URL'), shop)
    expect((await ctx.vault.listAll()).map(secret => secret.scope)).toEqual(['global'])
  })

  it('generates in a workspace, refusing a name already in that workspace only', async () => {
    const { ctx } = await mount()
    await ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' }, shop)
    await expect(ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' }, shop)).rejects.toThrow('already exists in this workspace')
    await ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' }, blog)
    await ctx.vault.generate(secretName('SESSION_KEY'), { length: 32, alphabet: 'hex' })
    expect((await ctx.vault.listAll()).length).toBe(3)
  })

  it('ignores a workspace record whose directory does not match its id', async () => {
    const { ctx, store } = await mount()
    const { workspaceRecordId } = await import('../src/vault/index.ts')
    store.editRecord(`vault-ws/${workspaceRecordId(shop, secretName('DB_URL'))}`, { kind: 'grant', payload: { value: 'moved-value-1', directory: blog } })
    store.editRecord(`vault-ws/${workspaceRecordId(shop, secretName('API_KEY'))}`, { kind: 'grant', payload: { value: 'real-value-12', directory: shop } })
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries().map(entry => entry.name)).toEqual(['API_KEY']) })
  })
})
