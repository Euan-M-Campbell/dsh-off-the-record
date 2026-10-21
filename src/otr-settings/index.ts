/**
 * Off the Record status: checks every row this bundle manages at startup and
 * after each recomposition, logs one summary line and a warning with the fix
 * for each difference, and serves the same report as `ctx.offTheRecord`.
 *
 * Mounted from the bare package specifier (`dsh-off-the-record`), because the
 * harness attaches a package's browser half only to that row.
 * @module dsh-off-the-record
 */

import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { checkComposition, describeReport, type CompositionReport, type LaterLayer, type RowView } from './check.ts'
import { pageStatus, setBraveKey, setChannel, setSearchProvider, setSearxngUrl, setSecret, type PageStatus } from './page.ts'

export { CHANNELS, checkComposition, describeReport, PRIVATE_SEARCH_PROVIDERS } from './check.ts'
export type { ChannelState, ChannelStatus, CompositionReport, LaterLayer, RowView, SearchStatus } from './check.ts'
export { BRAVE_KEY_REF, LIVE_CHANNELS } from './page.ts'
export type { PageStatus } from './page.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    offTheRecord: OffTheRecord
  }
}

/** Launch facts the harness provides as `profileContext`; only the fields read here. */
interface ProfileFacts {
  readonly name: string
  readonly patchPath: string
  readonly home: string
  readonly overlays: readonly { readonly id?: string }[]
  readonly telemetryDisabledEnv: string | undefined
}

/** Report plus launch facts that are not composition rows. */
export interface OffTheRecordStatus extends CompositionReport {
  /** The profile this process booted, when the harness reports one. */
  readonly profile?: string
  /** Whether DSH_TELEMETRY_DISABLED was set at launch, an independent backstop for the session upload. */
  readonly telemetryEnvBackstop: boolean
}

export interface Config {
  /** Delay before re-checking after a recomposition, in milliseconds. */
  recheckDelayMs: number
}

const ROW_ID_PATTERN = (id: string): RegExp => new RegExp(`^[\\s-]*id:\\s*['"]?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*(#.*)?$`, 'm')

/**
 * The Off the Record service.
 */
export default class OffTheRecord extends TypertRemoteService {
  static inject = ['loader']

  static Config: z<Config> = z.object({
    recheckDelayMs: z.number().step(1).min(0).max(60_000).default(250),
  })

  private latest: OffTheRecordStatus | undefined
  private lastLog = ''

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'offTheRecord')
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        this.refresh().catch((error: unknown) => { ctx.logger.warn('status check failed: %s', String(error)) })
      }, this.config.recheckDelayMs)
    }
    ctx.effect(() => () => { if (timer !== undefined) clearTimeout(timer) })
    ctx.on('loader/config-update', schedule)
    // Entries carry their composed config before every plugin has started, so
    // the first check need not wait; a one-shot run may exit within a second.
    const first = setImmediate(() => {
      this.refresh().catch((error: unknown) => { ctx.logger.warn('status check failed: %s', String(error)) })
    })
    ctx.effect(() => () => { clearImmediate(first) })
  }

  /**
   * The latest report, computing it first if none exists yet.
   * @returns every managed channel's state and the search selection.
   */
  @Remote
  async status(): Promise<OffTheRecordStatus> {
    return this.latest ?? await this.refresh()
  }

  /**
   * Everything the settings page shows, computed fresh.
   * @returns status, live switches, search setup, and secret names.
   */
  @Remote
  async pageStatus(): Promise<PageStatus> {
    return await pageStatus(this.ctx, await this.refresh(), this.rows())
  }

  /**
   * Turn a live channel off (restore this bundle's setting) or on.
   * @param id - channel row id.
   * @param off - true to turn it off.
   */
  @Remote
  async setChannel(id: string, off: boolean): Promise<void> {
    await setChannel(this.ctx, id, off)
  }

  /**
   * Choose the private search provider.
   * @param provider - `searxng` or `brave`.
   */
  @Remote
  async setSearchProvider(provider: string): Promise<void> {
    await setSearchProvider(this.ctx, provider)
  }

  /**
   * Set or clear the SearXNG instance URL.
   * @param url - the instance root, or empty to clear it.
   */
  @Remote
  async setSearxngUrl(url: string): Promise<void> {
    await setSearxngUrl(this.ctx, url)
  }

  /**
   * Store or remove the Brave API key; it is written to the credential store, never to configuration.
   * @param key - the key, or empty to remove it.
   */
  @Remote
  async setBraveKey(key: string): Promise<void> {
    await setBraveKey(this.ctx, key)
  }

  /**
   * Add, replace, or (with an empty value) remove a vault secret. Values travel to the Host only.
   * @param name - the secret name.
   * @param value - the value, or empty to remove it.
   */
  @Remote
  async setSecret(name: string, value: string): Promise<void> {
    await setSecret(this.ctx, name, value)
  }

  /**
   * Delete the anonymous installation id. The harness mints a new one at the next launch.
   * @returns whether a file was removed, and that the change applies at the next launch.
   */
  @Remote
  async resetAnonymousId(): Promise<{ readonly removed: boolean; readonly takesEffect: 'next-launch' }> {
    const home = this.profile()?.home
    if (home === undefined) throw new Error('offTheRecord: the harness home is unknown in this process')
    const path = join(home, '.anonymous-user-id')
    let removed = true
    await rm(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') removed = false
      else throw error
    })
    return { removed, takesEffect: 'next-launch' }
  }

  /** Recompute the report and log it when it changed. */
  private rows(): RowView[] {
    const rows: RowView[] = []
    for (const entry of this.ctx.loader.entries()) {
      rows.push({ id: entry.options.id, disabled: entry.options.disabled, config: entry.options.config })
    }
    return rows
  }

  private async refresh(): Promise<OffTheRecordStatus> {
    const profile = this.profile()
    const report = checkComposition(this.rows(), await this.laterLayers(profile))
    const status: OffTheRecordStatus = {
      ...report,
      ...profile === undefined ? {} : { profile: profile.name },
      telemetryEnvBackstop: (profile?.telemetryDisabledEnv ?? '') !== '',
    }
    this.latest = status
    const { summary, warnings } = describeReport(report)
    const log = [summary, ...warnings].join('\n')
    if (log !== this.lastLog) {
      this.lastLog = log
      this.ctx.logger.info(summary)
      for (const warning of warnings) {
        this.ctx.logger.warn(warning)
        // Plugin logs reach only the harness's log sinks; a channel silently back
        // on must also reach a terminal user, as the launcher's own lines do.
        process.stderr.write(`dsh-off-the-record: ${warning}\n`)
      }
    }
    return status
  }

  private profile(): ProfileFacts | undefined {
    return this.ctx.get('profileContext') as ProfileFacts | undefined
  }

  /** Layers above every bundle, highest precedence first: overlays, the home patch, the profile patch. */
  private async laterLayers(profile: ProfileFacts | undefined): Promise<LaterLayer[]> {
    if (profile === undefined) return []
    const fileLayer = async (path: string): Promise<LaterLayer | undefined> => {
      const text = await readFile(path, 'utf8').catch(() => undefined)
      if (text === undefined) return undefined
      return { label: path, mentions: id => ROW_ID_PATTERN(id).test(text) }
    }
    const overlays: LaterLayer = { label: 'a --patch overlay', mentions: id => profile.overlays.some(patch => patch.id === id) }
    const layers = [overlays, await fileLayer(join(profile.home, 'cordis.patch.yml')), await fileLayer(profile.patchPath)]
    return layers.filter((layer): layer is LaterLayer => layer !== undefined)
  }
}
