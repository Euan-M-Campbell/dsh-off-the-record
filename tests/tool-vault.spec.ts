import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import ToolRuntime, { defineTool, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import { describe, expect, it, vi } from 'vitest'
import * as brave from '../src/web-search-brave/index.ts'
import * as toolVault from '../src/tool-vault/index.ts'
import { secretName, workspaceDirectory } from '../src/vault/index.ts'
import LocalVault from '../src/vault-local/index.ts'
import { MemoryCredentials } from './support/memory-credentials.ts'

const SECRET = 'tok_9f8e7d6c5b4a'

/** A system-prompt service that accepts and ignores every call. */
const quietSystemPrompt = new Proxy({}, { get: () => () => 0 })

async function mount(options: { credentialsFirst?: boolean } = {}) {
  const ctx = new Context()
  ctx.provide('systemPrompt', quietSystemPrompt as never)
  await ctx.plugin(ToolRuntime, {})
  if (options.credentialsFirst !== false) await ctx.plugin(MemoryCredentials)
  await ctx.plugin(LocalVault, { minValueLength: 8, maxSecrets: 256 })
  const fiber = await ctx.plugin(toolVault, { generateLength: 32, redactEncodings: ['raw', 'base64', 'base64url', 'url', 'json'], minRedactLength: 8 })
  if (options.credentialsFirst === false) await ctx.plugin(MemoryCredentials)
  return { ctx, fiber }
}

let call = 0
async function run(ctx: Context, name: string, args: unknown = {}): Promise<ToolExecutionResult> {
  return await ctx.tools.execute({ callId: `call-${String(++call)}` as never, name, arguments: args, signal: new AbortController().signal })
}
const text = (result: ToolExecutionResult) => result.content.map(block => block.type === 'text' ? block.text : '').join('')

describe('tool-vault plugin', () => {
  it('has no default export', () => {
    expect('default' in toolVault).toBe(false)
  })

  it('registers list_secrets and create_secret, and run_with_secrets only with a shell', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.get('list_secrets')?.description).toBe(toolVault.DESCRIPTIONS.list_secrets)
    expect(ctx.tools.get('create_secret')?.description).toBe(toolVault.DESCRIPTIONS.create_secret)
    expect(ctx.tools.get('run_with_secrets')).toBeUndefined()
  })

  it('pins the model-facing descriptions', () => {
    expect(toolVault.DESCRIPTIONS).toMatchInlineSnapshot(`
      {
        "create_secret": "Generate a new random secret and store it in the vault under a new name, for example a session key or a password for a local service. It belongs to this workspace unless you set scope to global. You never see the value. You cannot store a value you supply: ask the user to add secrets they already have.",
        "list_secrets": "List the secrets you can use here, by name: global ones, and this workspace's own, which replace global ones of the same name. Values are never shown. Use a listed name with run_with_secrets to pass its value to a command.",
        "run_with_secrets": "Run a bash command with vault secrets set as environment variables. Name the secrets in \`secrets\`; refer to them in the command as $NAME, never by value. Runs like bash, in a fresh shell under the same sandbox. Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value.",
        "run_with_secrets_powershell": "Run a PowerShell command with vault secrets set as environment variables. Name the secrets in \`secrets\`; refer to them in the command as $env:NAME, never by value. Runs like pwsh, in a fresh shell under the same sandbox. Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value.",
      }
    `)
  })

  it('lists names, creates secrets without revealing them, and refuses bad names and lengths', async () => {
    const { ctx } = await mount()
    expect(text(await run(ctx, 'list_secrets'))).toBe('The vault is empty. The user adds secrets outside the conversation.')
    const created = await run(ctx, 'create_secret', { name: 'SESSION_KEY', length: 24, alphabet: 'hex' })
    expect(text(created)).toBe('Created SESSION_KEY (global, 24 hex characters). Pass it to a command with run_with_secrets as $SESSION_KEY.')
    const [entry] = ctx.vault.redactionEntries()
    expect(JSON.stringify(created)).not.toContain(entry?.value)
    expect(text(await run(ctx, 'list_secrets'))).toBe('SESSION_KEY (global, generated)')
    expect((await run(ctx, 'create_secret', { name: 'SESSION_KEY' })).isError).toBe(true)
    expect(text(await run(ctx, 'create_secret', { name: 'PATH' }))).toContain('reserved')
    expect(text(await run(ctx, 'create_secret', { name: 'SHORT_ONE', length: 8 }))).toContain('from 16 to 256')
  })

  it('redacts a stored value from any tool\'s result in the real registry pipeline', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('API_TOKEN'), SECRET)
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries()).toHaveLength(1) })
    ctx.tools.register(defineTool({
      name: 'leaky',
      description: 'test tool',
      parameters: {},
      output: { schema: { type: 'object', additionalProperties: false, properties: { out: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.out }] },
      execute: () => Promise.resolve({ out: `token=${SECRET} b64=${Buffer.from(SECRET).toString('base64')}` }),
    }))
    const result = await run(ctx, 'leaky')
    expect(result.isError).toBe(false)
    // The final base64 character and padding depend on bytes beyond the value, so up to three remain.
    expect(text(result)).toMatch(/^token=\[secret:API_TOKEN\] b64=\[secret:API_TOKEN\][A-Za-z0-9+/=]{0,3}$/)
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('redacts a thrown error message too', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('API_TOKEN'), SECRET)
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries()).toHaveLength(1) })
    ctx.tools.register(defineTool({
      name: 'throwing',
      description: 'test tool',
      parameters: {},
      output: { schema: { type: 'null' }, render: () => [] },
      execute: () => Promise.reject(new Error(`auth failed with ${SECRET}`)),
    }))
    const result = await run(ctx, 'throwing')
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(text(result)).toContain('[secret:API_TOKEN]')
  })

  it('loads the vault when the credential store starts after it', async () => {
    const { ctx } = await mount({ credentialsFirst: false })
    await (ctx.get('credentials') as unknown as MemoryCredentials).modifyRecord('vault/late-key' as never, () => Promise.resolve({ kind: 'api-key', key: 'late-value-123' }))
    await vi.waitFor(() => { expect(ctx.vault.redactionEntries().map(entry => entry.name)).toEqual(['LATE_KEY']) })
  })

  it('stops redacting and unregisters its tools on dispose', async () => {
    const { ctx, fiber } = await mount()
    await fiber.dispose()
    expect(ctx.tools.get('list_secrets')).toBeUndefined()
    expect(ctx.tools.get('create_secret')).toBeUndefined()
  })
})

describe('Brave and a late credential store', () => {
  it('becomes available when the store starts after it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })))
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: 'brave' })
      await ctx.plugin(brave, {})
      await ctx.plugin(MemoryCredentials)
      await ctx.credentials.set(credentialRef('BRAVE_API_KEY'), 'brave-late')
      await vi.waitFor(() => expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [] }))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('session workspace', () => {
  const { sessionWorkspace } = toolVault
  const session = (id: string, cwd?: string, parentSession?: string) => ({ header: { id, ...cwd === undefined ? {} : { cwd }, ...parentSession === undefined ? {} : { parentSession } } })

  it('is the directory the root session was created in', () => {
    expect(sessionWorkspace(session('root', '/work/shop'), undefined)).toBe(workspaceDirectory('/work/shop'))
    expect(sessionWorkspace(session('root'), undefined)).toBeUndefined()
    expect(sessionWorkspace(undefined, undefined)).toBeUndefined()
  })

  it('follows live parents, so a subagent started elsewhere keeps the parent workspace', () => {
    const live = new Map([['root', session('root', '/work/shop')], ['child', session('child', '/work/blog', 'root')]])
    const sessions = { get: (id: never) => live.get(id) }
    expect(sessionWorkspace(session('grandchild', '/work/other', 'child'), sessions)).toBe(workspaceDirectory('/work/shop'))
  })

  it('falls back to the session\'s own recorded directory when the parent is not loaded, and stops on a cycle', () => {
    expect(sessionWorkspace(session('child', '/work/shop', 'gone'), { get: () => undefined })).toBe(workspaceDirectory('/work/shop'))
    const loop = new Map([['a', session('a', '/work/a', 'b')], ['b', session('b', '/work/b', 'a')]])
    expect([workspaceDirectory('/work/a'), workspaceDirectory('/work/b')]).toContain(sessionWorkspace(loop.get('a'), { get: (id: never) => loop.get(id) }))
  })
})

describe('vault tools in a workspace', () => {
  async function runIn(ctx: Context, name: string, args: unknown, cwd: string) {
    return await ctx.tools.execute({ callId: `call-${String(++call)}` as never, name, arguments: args, signal: new AbortController().signal, agent: { session: { header: { id: 's1', cwd } } } as never })
  }

  it('lists global and workspace secrets with their scope, and creates in the workspace by default', async () => {
    const { ctx } = await mount()
    await ctx.vault.set(secretName('DB_URL'), 'global-db-url')
    await ctx.vault.set(secretName('SHOP_KEY'), 'shop-key-123', workspaceDirectory('/work/shop'))
    expect(text(await runIn(ctx, 'list_secrets', {}, '/work/shop'))).toBe('DB_URL (global, user)\nSHOP_KEY (workspace, user)')
    expect(text(await runIn(ctx, 'list_secrets', {}, '/work/blog'))).toBe('DB_URL (global, user)')
    expect(text(await runIn(ctx, 'create_secret', { name: 'BLOG_KEY' }, '/work/blog'))).toContain('Created BLOG_KEY (workspace,')
    expect(text(await runIn(ctx, 'create_secret', { name: 'SHARED_KEY', scope: 'global' }, '/work/blog'))).toContain('Created SHARED_KEY (global,')
    expect(text(await runIn(ctx, 'list_secrets', {}, '/work/shop'))).toBe('DB_URL (global, user)\nSHARED_KEY (global, generated)\nSHOP_KEY (workspace, user)')
  })

  it('creates a global secret when the session has no workspace', async () => {
    const { ctx } = await mount()
    expect(text(await run(ctx, 'create_secret', { name: 'ANY_KEY' }))).toContain('Created ANY_KEY (global,')
    expect(text(await run(ctx, 'create_secret', { name: 'WS_KEY', scope: 'workspace' }))).toContain('no workspace directory')
  })
})
