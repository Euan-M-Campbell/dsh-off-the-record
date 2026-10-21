/**
 * SearXNG search provider plugin. Registers provider id `searxng` into the
 * `ctx.web` registry; `patches/private-search.patch.yml` selects it.
 *
 * The instance URL comes only from this plugin's configuration, never from the
 * environment: the environment includes the opened project's `.env`, and a
 * repository must not be able to redirect searches to its own server.
 * @module dsh-off-the-record/web-search-searxng
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { DEFAULT_SEARCH_TIMEOUT_MS, DEFAULT_USER_AGENT } from '../shared/search-http.ts'
import { baseUrlProblem, SearxngSearchProvider } from './provider.ts'

export { SEARXNG_PROVIDER_ID, SearxngSearchProvider } from './provider.ts'
export type { SearxngSettings } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'otr-web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin configuration; every field is live-editable. */
export interface Config {
  /** Instance root, such as `http://127.0.0.1:8888`. Empty leaves search unconfigured. */
  baseURL: Volatile<string>
  /** Comma-separated SearXNG engine names to query; empty uses the instance's defaults. */
  engines: Volatile<string>
  /** Comma-separated SearXNG categories; empty uses the instance's defaults. */
  categories: Volatile<string>
  /** Per-search deadline in milliseconds, on top of the caller's cancellation. */
  searchTimeoutMs: Volatile<number>
  /** `user-agent` header sent to the instance. */
  userAgent: Volatile<string>
}

export const Config = z.object({
  baseURL: z.string().default('').volatile(),
  engines: z.string().pattern(/^[\w ,.-]*$/).default('').volatile(),
  categories: z.string().pattern(/^[\w ,.-]*$/).default('').volatile(),
  searchTimeoutMs: z.number().step(1).min(1_000).max(120_000).default(DEFAULT_SEARCH_TIMEOUT_MS).volatile(),
  userAgent: z.string().pattern(/^[\x21-\x7e][\x20-\x7e]{0,255}$/).default(DEFAULT_USER_AGENT).volatile(),
})

/**
 * Register the SearXNG provider with `ctx.web`. A malformed instance URL fails
 * the plugin at load; an empty one leaves the provider registered but unavailable.
 * @param ctx - plugin context with `web` injected.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const initial = config.baseURL.get()
  const problem = initial.length === 0 ? undefined : baseUrlProblem(initial)
  if (problem !== undefined) throw new Error(`otr-web-search-searxng: baseURL: ${problem}`)
  ctx.web.registerSearchProvider(new SearxngSearchProvider(() => ({
    baseURL: config.baseURL.get(),
    engines: config.engines.get(),
    categories: config.categories.get(),
    searchTimeoutMs: config.searchTimeoutMs.get(),
    userAgent: config.userAgent.get(),
  })))
}
