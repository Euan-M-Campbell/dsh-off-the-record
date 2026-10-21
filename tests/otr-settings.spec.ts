import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { checkComposition, describeReport, type LaterLayer, type RowView } from '../src/otr-settings/check.ts'
import * as otr from '../src/otr-settings/index.ts'
import { compose, harnessLayer, ownLayer, userLayer, type Row } from './compose.ts'

const base = harnessLayer('@deepseek-ai/dsh-base')
const webApp = harnessLayer('@deepseek-ai/dsh-web-app')
const own = ownLayer()

const rows = (composed: { rows: readonly Row[] }) => composed.rows.map(row => ({ id: row.id ?? '', disabled: row.disabled, config: row.config }))
const layer = (label: string, ids: readonly string[]): LaterLayer => ({ label, mentions: id => ids.includes(id) })

describe('Off the Record status check', () => {
  it('reports every channel off and search private with the bundle alone', () => {
    const report = checkComposition(rows(compose(base, webApp, own)), [])
    expect(report.channels.map(channel => [channel.id, channel.state])).toEqual([
      ['session-telemetry-otel', 'off'],
      ['session-log-deepseek', 'off'],
      ['plugin-package-inventory-deepseek', 'off'],
      ['product-analytics', 'off'],
      ['web-search-deepseek', 'off'],
      ['web-deepseek-api', 'off'],
    ])
    expect(report.search).toEqual({ provider: 'searxng', fetchProvider: 'http', private: true })
    expect(describeReport(report)).toEqual({ summary: 'OTR: 4 of 4 telemetry channels off, search: searxng', warnings: [] })
  })

  it('reports desktop analytics as not present in a profile without the Web app', () => {
    const report = checkComposition(rows(compose(base, own)), [])
    expect(report.channels.find(channel => channel.id === 'product-analytics')?.state).toBe('not-present')
    expect(describeReport(report).summary).toBe('OTR: 3 of 3 telemetry channels off, search: searxng')
  })

  it('reports every channel on without the bundle', () => {
    const report = checkComposition(rows(compose(base, webApp)), [])
    expect(report.channels.every(channel => channel.state === 'on')).toBe(true)
    expect(report.search.private).toBe(false)
  })

  it('names the layer that turned a channel back on, and how to undo it', () => {
    const composed = compose(base, webApp, own, userLayer('- id: session-log-deepseek\n  config:\n    enabled: true\n'))
    const report = checkComposition(rows(composed), [layer('a --patch overlay', []), layer('/home/me/.dsh/profiles/web/cordis.patch.yml', ['session-log-deepseek'])])
    expect(report.channels.find(channel => channel.id === 'session-log-deepseek')).toEqual({
      id: 'session-log-deepseek',
      part: 'telemetry',
      label: 'Session log on DeepSeek requests',
      state: 'on',
      changedBy: '/home/me/.dsh/profiles/web/cordis.patch.yml',
      fix: 'Remove the "session-log-deepseek" entry from /home/me/.dsh/profiles/web/cordis.patch.yml to turn it off again.',
    })
    expect(describeReport(report).warnings).toEqual([
      'Session log on DeepSeek requests is on (set in /home/me/.dsh/profiles/web/cordis.patch.yml). Remove the "session-log-deepseek" entry from /home/me/.dsh/profiles/web/cordis.patch.yml to turn it off again.',
    ])
  })

  it('points at later bundles when no user layer names the row', () => {
    const composed = compose(base, webApp, own, userLayer('- id: plugin-package-inventory-deepseek\n  config:\n    enabled: true\n'))
    const report = checkComposition(rows(composed), [])
    expect(report.channels.find(channel => channel.id === 'plugin-package-inventory-deepseek')).toMatchObject({
      state: 'on',
      fix: expect.stringContaining('bundles installed after dsh-off-the-record'),
    })
  })

  it('reports a renamed row as missing', () => {
    const renamed = rows(compose(base, webApp, own)).filter(row => row.id !== 'session-log-deepseek')
    expect(checkComposition(renamed, []).channels.find(channel => channel.id === 'session-log-deepseek')).toMatchObject({
      state: 'missing',
      fix: expect.stringContaining('update dsh-off-the-record'),
    })
  })

  it('warns with the reset when a DeepSeek search provider is selected', () => {
    const composed = compose(base, webApp, own, userLayer('- id: web\n  config:\n    searchProvider: deepseek-search-api\n    fetchProvider: deepseek-fetch-api\n'))
    const { warnings } = describeReport(checkComposition(rows(composed), []))
    expect(warnings).toEqual([
      expect.stringContaining('web.searchProvider is "deepseek-search-api", a DeepSeek provider'),
      expect.stringContaining('web.fetchProvider is "deepseek-fetch-api"'),
    ])
  })

  it('accepts Brave as private search', () => {
    const composed = compose(base, webApp, own, userLayer('- id: web\n  config:\n    searchProvider: brave\n    fetchProvider: http\n'))
    expect(describeReport(checkComposition(rows(composed), [])).summary).toBe('OTR: 4 of 4 telemetry channels off, search: brave')
  })

  it('exports the service as the package default', () => {
    expect(otr.default.name).toBe('OffTheRecord')
  })
})

describe('Off the Record service', () => {
  async function mount(entries: readonly RowView[], patch = '') {
    const home = mkdtempSync(join(tmpdir(), 'otr-home-'))
    const patchPath = join(home, 'profiles', 'web.patch.yml')
    mkdirSync(join(home, 'profiles'))
    writeFileSync(patchPath, patch)
    const ctx = new Context()
    ctx.provide('loader', { entries: () => entries.map(options => ({ options })) } as never)
    ctx.provide('profileContext', { name: 'web', patchPath, home, overlays: [], telemetryDisabledEnv: '1' } as never)
    const fiber = await ctx.plugin(otr.default, { recheckDelayMs: 0 })
    return { ctx, fiber, home }
  }

  const healthy = rows(compose(base, webApp, own))

  it('serves the status of the running composition', async () => {
    const { ctx, fiber } = await mount(healthy)
    const status = await ctx.offTheRecord.status()
    expect(status.profile).toBe('web')
    expect(status.telemetryEnvBackstop).toBe(true)
    expect(status.channels.every(channel => channel.state === 'off')).toBe(true)
    await fiber.dispose()
  })

  it('names the profile patch that re-enabled a channel', async () => {
    const reenabled = healthy.map(row => row.id === 'session-log-deepseek' ? { ...row, config: { enabled: true } } : row)
    const { ctx, fiber } = await mount(reenabled, '- id: session-log-deepseek\n  config:\n    enabled: true\n')
    const channel = (await ctx.offTheRecord.status()).channels.find(entry => entry.id === 'session-log-deepseek')
    expect(channel?.changedBy).toMatch(/web\.patch\.yml$/)
    await fiber.dispose()
  })

  it('resets the anonymous installation id', async () => {
    const { ctx, fiber, home } = await mount(healthy)
    writeFileSync(join(home, '.anonymous-user-id'), 'old-id')
    await expect(ctx.offTheRecord.resetAnonymousId()).resolves.toEqual({ removed: true, takesEffect: 'next-launch' })
    expect(existsSync(join(home, '.anonymous-user-id'))).toBe(false)
    await expect(ctx.offTheRecord.resetAnonymousId()).resolves.toEqual({ removed: false, takesEffect: 'next-launch' })
    await fiber.dispose()
  })

  it('removes the service on dispose', async () => {
    const { ctx, fiber } = await mount(healthy)
    await fiber.dispose()
    expect(ctx.get('offTheRecord')).toBeUndefined()
  })
})
