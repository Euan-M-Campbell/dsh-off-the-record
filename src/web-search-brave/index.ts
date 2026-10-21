/**
 * Brave Search provider plugin. Registers provider id `brave` into the
 * `ctx.web` registry. The API key is a harness credential resolved per search;
 * it never enters configuration, a session, or the vault. Profiles without the
 * credential store (one-shot `headless`) read it from the launch environment.
 * @module dsh-off-the-record/web-search-brave
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { DEFAULT_SEARCH_TIMEOUT_MS, DEFAULT_USER_AGENT } from '../shared/search-http.ts'
import { BraveSearchProvider } from './provider.ts'

export { BRAVE_PROVIDER_ID, BRAVE_SEARCH_ENDPOINT, BraveSearchProvider } from './provider.ts'
export type { BraveKeySource, BraveSettings } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'otr-web-search-brave'

/** The web seam this provider registers into. The credential store is optional and read per use. */
export const inject = ['web']

/** Plugin configuration; every field is live-editable. */
export interface Config {
  /** Credential reference holding the Brave API key. */
  apiKeyEnv: Volatile<string>
  /** Per-search deadline in milliseconds, on top of the caller's cancellation. */
  searchTimeoutMs: Volatile<number>
  /** `user-agent` header sent to Brave. */
  userAgent: Volatile<string>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default('BRAVE_API_KEY').volatile(),
  searchTimeoutMs: z.number().step(1).min(1_000).max(120_000).default(DEFAULT_SEARCH_TIMEOUT_MS).volatile(),
  userAgent: z.string().pattern(/^[\x21-\x7e][\x20-\x7e]{0,255}$/).default(DEFAULT_USER_AGENT).volatile(),
})

/**
 * Register the Brave provider with `ctx.web`. `available()` answers from the
 * last credential description, refreshed at start, on every stored-credential
 * change, and after each search.
 * @param ctx - plugin context with `web` injected.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const ref = () => credentialRef(config.apiKeyEnv.get())
  const resolveKey = async (): Promise<string | undefined> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) return (await credentials.resolve(ref()))?.value
    // Without the credential store the launch environment is the whole credential plane.
    const ambient = launchEnvironmentOf(ctx).get(ref())?.value
    return ambient === undefined || ambient.length === 0 ? undefined : ambient
  }
  let configured = false
  let generation = 0
  const refresh = async (): Promise<void> => {
    const current = ++generation
    const credentials = ctx.get('credentials')
    const present = credentials === undefined ? await resolveKey() !== undefined : (await credentials.describe(ref())).configured
    if (current === generation) configured = present
  }
  const refreshQuietly = (): void => {
    refresh().catch((error: unknown) => { ctx.logger.warn('could not read the Brave API key state: %s', String(error)) })
  }
  refreshQuietly()
  ctx.on('credentials/reference-updated', (ref) => { if (ref === config.apiKeyEnv.get()) refreshQuietly() })
  ctx.on('loader/volatile-update', refreshQuietly)

  ctx.web.registerSearchProvider(new BraveSearchProvider({
    configured: () => configured,
    resolve: async () => {
      const key = await resolveKey()
      configured = key !== undefined
      return key
    },
  }, () => ({ searchTimeoutMs: config.searchTimeoutMs.get(), userAgent: config.userAgent.get() })))
}
