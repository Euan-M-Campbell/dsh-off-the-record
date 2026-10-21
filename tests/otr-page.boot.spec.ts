// Boots the published dsh CLI with this bundle installed and calls the
// offTheRecord Remote methods through the API Gateway's invoke path, as an
// owner Peer, the way the settings page's calls arrive from a browser.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanUp, root, runTask, writePatch } from './support/boot.ts'

afterAll(cleanUp)

const require = createRequire(import.meta.url)
const dsh = dirname(require.resolve('@deepseek-ai/dsh/package.json'))
const connectionUrl = pathToFileURL(require.resolve('@deepseek-ai/dsh-client-connection', { paths: [dsh] })).href
const probePatch = join(root, 'tests/fixtures/gateway-probe.patch.yml')
// headless disables the credential store, which the Brave key and the vault need.
const withCredentials = writePatch('- id: credentials\n  disabled: false\n')

interface Outcome { readonly method: string; readonly ok: boolean; readonly value?: unknown; readonly error?: string }

async function probe(calls: [string, Record<string, unknown>, number?][]): Promise<{ outcomes: Outcome[]; profilePatch: string; credentials: string }> {
  let stderr = ''
  let profilePatch = ''
  let credentials = ''
  await runTask([withCredentials, probePatch], {
    bundle: true,
    // A slowly streamed reply keeps the one-shot run alive while the probe works.
    model: { sequence: ['slow_success'], repeatLast: true, successText: 'x'.repeat(60), chunkSize: 1, chunkDelayMs: 100 },
    env: { OTR_CONNECTION_URL: connectionUrl, OTR_PROBE_CALLS: JSON.stringify(calls) },
    onOutput: (output) => { stderr = output.stderr },
    inspectHome: (_home, dshHome) => {
      profilePatch = readFileSync(join(dshHome, 'profiles/headless/cordis.patch.yml'), 'utf8')
      try { credentials = readFileSync(join(dshHome, '.credentials.yaml'), 'utf8') } catch { credentials = '' }
    },
  })
  const line = stderr.split('\n').find(text => text.startsWith('OTR_PROBE '))
  if (line === undefined) throw new Error(`the probe printed nothing:\n${stderr}`)
  return { outcomes: JSON.parse(line.slice('OTR_PROBE '.length)) as Outcome[], profilePatch, credentials }
}

const status = (outcome: Outcome | undefined) => outcome?.value as {
  channels: { id: string; state: string }[]
  search: { provider: string }
  searxng: { baseURL: string }
  brave: { keyConfigured: boolean }
  vault: { writable: boolean; secrets: { name: string; origin: string }[] }
  liveChannels: string[]
  newIdEachStart: boolean
}

describe('settings page Remote, through the Gateway', { timeout: 300_000 }, () => {
  it('reads the page status', async () => {
    const { outcomes } = await probe([['pageStatus', {}]])
    expect(outcomes[0]?.ok).toBe(true)
    const page = status(outcomes[0])
    expect(page.search.provider).toBe('searxng')
    expect(page.channels.find(channel => channel.id === 'session-log-deepseek')?.state).toBe('off')
    expect(page.liveChannels).toEqual(['session-log-deepseek'])
    expect(page.vault.writable).toBe(true)
  })

  it('applies every change and reflects it in the next status', async () => {
    const { outcomes, profilePatch, credentials } = await probe([
      ['setSearxngUrl', { url: 'http://127.0.0.1:8888' }],
      ['setChannel', { id: 'session-log-deepseek', off: false }],
      ['setSearchProvider', { provider: 'brave' }],
      ['setBraveKey', { key: 'brave-test-key' }],
      ['setSecret', { name: 'PAGE_SECRET', value: 'page-secret-value' }],
      ['setNewIdEachStart', { on: false }],
      ['pageStatus', {}, 1500],
    ])
    expect(outcomes.filter(outcome => !outcome.ok)).toEqual([])
    const page = status(outcomes.at(-1))
    expect(page.searxng.baseURL).toBe('http://127.0.0.1:8888')
    expect(page.search.provider).toBe('brave')
    expect(page.channels.find(channel => channel.id === 'session-log-deepseek')?.state).toBe('on')
    expect(page.brave.keyConfigured).toBe(true)
    expect(page.vault.secrets).toEqual([{ name: 'PAGE_SECRET', origin: 'user' }])
    expect(page.newIdEachStart).toBe(false)
    // Settings changes persist in the profile patch; secrets only in the credential store.
    expect(profilePatch).toContain('http://127.0.0.1:8888')
    expect(profilePatch).not.toContain('page-secret-value')
    expect(profilePatch).not.toContain('brave-test-key')
    expect(credentials).toContain('vault/page-secret')
  })

  it('turns a channel back off by removing the profile override', async () => {
    const { outcomes, profilePatch } = await probe([
      ['setChannel', { id: 'session-log-deepseek', off: false }],
      ['setChannel', { id: 'session-log-deepseek', off: true }, 800],
      ['pageStatus', {}, 1500],
    ])
    expect(outcomes.filter(outcome => !outcome.ok)).toEqual([])
    expect(status(outcomes.at(-1)).channels.find(channel => channel.id === 'session-log-deepseek')?.state).toBe('off')
    expect(profilePatch).not.toMatch(/enabled:\s*true/)
  })

  it('refuses invalid changes with a reason', async () => {
    const { outcomes } = await probe([
      ['setSearxngUrl', { url: 'http://search.example.com' }],
      ['setSecret', { name: 'PATH', value: 'whatever-123' }],
      ['setSecret', { name: 'SHORT_ONE', value: 'abc' }],
      ['setChannel', { id: 'session-telemetry-otel', off: false }],
      ['setSearchProvider', { provider: 'deepseek-official' }],
    ])
    expect(outcomes.map(outcome => [outcome.method, outcome.ok])).toEqual([
      ['setSearxngUrl', false], ['setSecret', false], ['setSecret', false], ['setChannel', false], ['setSearchProvider', false],
    ])
    expect(outcomes[0]?.error).toContain('use https')
    expect(outcomes[1]?.error).toContain('reserved')
    expect(outcomes[2]?.error).toContain('at least 8 characters')
    expect(outcomes[3]?.error).toContain('cannot be changed from this page')
    expect(outcomes[4]?.error).toContain('not a private search provider')
  })
})
