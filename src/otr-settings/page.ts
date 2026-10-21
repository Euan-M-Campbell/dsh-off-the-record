/**
 * What the Off the Record settings page shows, and the changes it can make.
 * Every write goes through a harness service (settings, credentials, vault)
 * and is validated here, on the Host; the page sends names and values only.
 * @module dsh-off-the-record/otr-settings/page
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { secretName, secretNameProblem, type SecretInfo } from '../vault/index.ts'
import { baseUrlProblem } from '../web-search-searxng/provider.ts'
import type { CompositionReport, RowView } from './check.ts'

/** Channels whose switch is live (`.volatile()`), and so can be changed from the page. */
export const LIVE_CHANNELS: readonly string[] = ['session-log-deepseek', 'product-analytics']

/** The Brave key's credential reference. */
export const BRAVE_KEY_REF = 'BRAVE_API_KEY'

const SEARXNG_ROW = 'otr-web-search-searxng'

/** Everything the page renders, in one JSON value. */
export interface PageStatus extends CompositionReport {
  readonly profile?: string
  readonly telemetryEnvBackstop: boolean
  readonly newIdEachStart: boolean
  /** Whether the harness settings service is available to make live changes. */
  readonly settingsAvailable: boolean
  /** Channel ids the page can switch without a restart. */
  readonly liveChannels: readonly string[]
  readonly searxng: { readonly baseURL: string; readonly problem?: string }
  readonly brave: { readonly keyConfigured: boolean; readonly keyWritable: boolean }
  readonly vault: { readonly available: boolean; readonly writable: boolean; readonly secrets: readonly SecretInfo[] }
}

/**
 * Assemble the page status from the composition report and the live services.
 * @param ctx - the Off the Record service context.
 * @param report - the composition report with launch facts.
 * @param rows - Loader entries.
 * @returns the page status.
 */
export async function pageStatus(
  ctx: Context,
  report: CompositionReport & { readonly profile?: string; readonly telemetryEnvBackstop: boolean; readonly newIdEachStart: boolean },
  rows: readonly RowView[],
): Promise<PageStatus> {
  const searxngRow = rows.find(row => row.id === SEARXNG_ROW)
  const rawURL = (searxngRow?.config as { baseURL?: unknown } | undefined)?.baseURL
  const baseURL = typeof rawURL === 'string' ? rawURL : ''
  const problem = baseUrlProblem(baseURL)
  const credentials = ctx.get('credentials')
  const brave = credentials === undefined
    ? { keyConfigured: false, keyWritable: false }
    : await credentials.describe(credentialRef(BRAVE_KEY_REF)).then(info => ({ keyConfigured: info.configured, keyWritable: info.writable }))
  const vault = ctx.get('vault')
  return {
    ...report,
    settingsAvailable: ctx.get('settings') !== undefined,
    liveChannels: LIVE_CHANNELS.filter(id => report.channels.some(channel => channel.id === id && channel.state !== 'not-present' && channel.state !== 'missing')),
    searxng: { baseURL, ...problem === undefined ? {} : { problem } },
    brave,
    vault: {
      available: vault !== undefined,
      writable: vault !== undefined && credentials !== undefined,
      secrets: vault === undefined ? [] : [...await vault.list()],
    },
  }
}

function settings(ctx: Context) {
  const service = ctx.get('settings')
  if (service === undefined) throw new Error('the harness settings service is not running in this profile, so changes must be made in cordis.patch.yml')
  return service
}

/**
 * Turn a live channel off or on. Off removes the profile's override, so this
 * bundle's setting applies again; on writes `enabled: true` into the profile.
 * @param ctx - the Off the Record service context.
 * @param id - a channel id from {@link LIVE_CHANNELS}.
 * @param off - true to turn the channel off.
 */
export async function setChannel(ctx: Context, id: string, off: boolean): Promise<void> {
  if (!LIVE_CHANNELS.includes(id)) throw new Error(`"${id}" cannot be changed from this page; edit your profile's cordis.patch.yml and restart`)
  await settings(ctx).mutate(id, [off ? { op: 'unset', path: ['enabled'] } : { op: 'set', path: ['enabled'], value: true }])
}

/**
 * Turn replacing the anonymous installation id at every start on or off. On is
 * this bundle's default, so turning it on removes the profile override.
 * @param ctx - the Off the Record service context.
 * @param on - true to replace the id at every start.
 */
export async function setNewIdEachStart(ctx: Context, on: boolean): Promise<void> {
  await settings(ctx).mutate('otr-settings', [on ? { op: 'unset', path: ['newIdEachStart'] } : { op: 'set', path: ['newIdEachStart'], value: false }])
}

/**
 * Choose the private search provider. SearXNG is this bundle's own selection,
 * so choosing it removes any profile override, including a stale DeepSeek one.
 * @param ctx - the Off the Record service context.
 * @param provider - `searxng` or `brave`.
 */
export async function setSearchProvider(ctx: Context, provider: string): Promise<void> {
  if (provider !== 'searxng' && provider !== 'brave') throw new Error(`"${provider}" is not a private search provider; choose searxng or brave`)
  await settings(ctx).mutate('web', [
    provider === 'searxng' ? { op: 'unset', path: ['searchProvider'] } : { op: 'set', path: ['searchProvider'], value: 'brave' },
    { op: 'unset', path: ['fetchProvider'] },
  ])
}

/**
 * Set or clear the SearXNG instance URL.
 * @param ctx - the Off the Record service context.
 * @param url - the instance root, or empty to clear it.
 */
export async function setSearxngUrl(ctx: Context, url: string): Promise<void> {
  const trimmed = url.trim()
  if (trimmed.length > 0) {
    const problem = baseUrlProblem(trimmed)
    if (problem !== undefined) throw new Error(problem)
  }
  await settings(ctx).mutate(SEARXNG_ROW, [trimmed.length === 0 ? { op: 'unset', path: ['baseURL'] } : { op: 'set', path: ['baseURL'], value: trimmed }])
}

/**
 * Store or remove the Brave API key in the harness credential store.
 * @param ctx - the Off the Record service context.
 * @param key - the key, or empty to remove it.
 */
export async function setBraveKey(ctx: Context, key: string): Promise<void> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) throw new Error('this profile has no credential store')
  const trimmed = key.trim()
  if (trimmed.length === 0) await credentials.unset(credentialRef(BRAVE_KEY_REF))
  else await credentials.set(credentialRef(BRAVE_KEY_REF), trimmed)
}

/**
 * Add or replace a vault secret, or remove it when the value is empty.
 * @param ctx - the Off the Record service context.
 * @param name - the secret name.
 * @param value - the value, or empty to remove the secret.
 */
export async function setSecret(ctx: Context, name: string, value: string): Promise<void> {
  const vault = ctx.get('vault')
  if (vault === undefined) throw new Error('the secrets vault is not running in this profile')
  const problem = secretNameProblem(name)
  if (problem !== undefined) throw new Error(problem)
  if (value.length === 0) await vault.unset(secretName(name))
  else await vault.set(secretName(name), value)
}
