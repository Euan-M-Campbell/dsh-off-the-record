/**
 * Compares the running composition against what this bundle sets, row by row,
 * and explains every difference. Pure: callers supply the rows and layers.
 * @module dsh-off-the-record/otr-settings/check
 */

/** The parts of a Loader entry the check reads. */
export interface RowView {
  readonly id: string
  readonly disabled?: unknown
  readonly config?: unknown
}

/** A configuration layer above this bundle that may override its rows. */
export interface LaterLayer {
  /** Where the layer lives, such as a file path or `--patch overlay`. */
  readonly label: string
  /** Whether the layer names this row id. */
  mentions(id: string): boolean
}

/** One managed channel's state. */
export type ChannelState =
  /** The bundle's setting is in force. */
  | 'off'
  /** A later layer, or a harness change, turned the channel back on. */
  | 'on'
  /** The row no longer exists in this harness release; the bundle cannot manage it. */
  | 'missing'
  /** The row only exists in some profiles (desktop analytics), and not in this one. */
  | 'not-present'

export interface ChannelStatus {
  readonly id: string
  readonly part: 'telemetry' | 'search'
  readonly label: string
  readonly state: ChannelState
  /** The later layer that names this row, when the state is `on`. */
  readonly changedBy?: string
  /** How to restore the bundle's setting; present for `on` and `missing`. */
  readonly fix?: string
}

export interface SearchStatus {
  readonly provider: string
  readonly fetchProvider: string
  /** Whether the selected provider is one of this bundle's. */
  readonly private: boolean
}

export interface CompositionReport {
  readonly channels: readonly ChannelStatus[]
  readonly search: SearchStatus
}

interface Channel {
  readonly id: string
  readonly part: 'telemetry' | 'search'
  readonly label: string
  /** Rows that exist only in some profiles report `not-present` instead of `missing`. */
  readonly optional?: boolean
  /** Whether the row is in the state this bundle sets. */
  readonly isOff: (row: RowView) => boolean
}

const config = (row: RowView): Record<string, unknown> =>
  typeof row.config === 'object' && row.config !== null ? row.config as Record<string, unknown> : {}

/** Every channel this bundle manages, in display order. */
export const CHANNELS: readonly Channel[] = [
  { id: 'session-telemetry-otel', part: 'telemetry', label: 'Feedback session upload', isOff: row => config(row).mode === 'DISABLED' || row.disabled === true },
  { id: 'session-log-deepseek', part: 'telemetry', label: 'Session log on DeepSeek requests', isOff: row => config(row).enabled === false || row.disabled === true },
  { id: 'plugin-package-inventory-deepseek', part: 'telemetry', label: 'Plugin inventory on DeepSeek requests', isOff: row => config(row).enabled === false || row.disabled === true },
  { id: 'product-analytics', part: 'telemetry', label: 'Desktop usage analytics', optional: true, isOff: row => config(row).enabled === false || row.disabled === true },
  { id: 'web-search-deepseek', part: 'search', label: 'DeepSeek search provider', isOff: row => row.disabled === true },
  { id: 'web-deepseek-api', part: 'search', label: 'DeepSeek Search and Fetch API providers', isOff: row => row.disabled === true },
]

/** Search providers this bundle ships. */
export const PRIVATE_SEARCH_PROVIDERS: readonly string[] = ['searxng', 'brave']

/**
 * Check the composition.
 * @param rows - every Loader entry, flattened.
 * @param layers - layers that apply after this bundle, highest precedence first.
 * @returns one status per managed channel, and the search selection.
 */
export function checkComposition(rows: readonly RowView[], layers: readonly LaterLayer[]): CompositionReport {
  const byId = new Map(rows.map(row => [row.id, row]))
  const channels = CHANNELS.map((channel): ChannelStatus => {
    const base = { id: channel.id, part: channel.part, label: channel.label }
    const row = byId.get(channel.id)
    if (row === undefined) {
      if (channel.optional === true) return { ...base, state: 'not-present' }
      return { ...base, state: 'missing', fix: `This harness release has no "${channel.id}" row; update dsh-off-the-record.` }
    }
    if (channel.isOff(row)) return { ...base, state: 'off' }
    const layer = layers.find(candidate => candidate.mentions(channel.id))
    return {
      ...base,
      state: 'on',
      ...layer === undefined ? {} : { changedBy: layer.label },
      fix: layer === undefined
        ? `Something other than your own patches changed "${channel.id}"; check bundles installed after dsh-off-the-record.`
        : `Remove the "${channel.id}" entry from ${layer.label} to turn it off again.`,
    }
  })
  const web = byId.get('web')
  const webConfig = web === undefined ? {} : config(web)
  const provider = typeof webConfig.searchProvider === 'string' ? webConfig.searchProvider : ''
  const fetchProvider = typeof webConfig.fetchProvider === 'string' ? webConfig.fetchProvider : ''
  return { channels, search: { provider, fetchProvider, private: PRIVATE_SEARCH_PROVIDERS.includes(provider) } }
}

/**
 * Turn a report into log lines: one summary, and one warning per problem.
 * @param report - the composition report.
 * @returns the summary and warnings.
 */
export function describeReport(report: CompositionReport): { summary: string; warnings: string[] } {
  const telemetry = report.channels.filter(channel => channel.part === 'telemetry' && channel.state !== 'not-present')
  const off = telemetry.filter(channel => channel.state === 'off').length
  const search = report.search.private ? `search: ${report.search.provider}` : `search: ${report.search.provider || 'unset'} (not private)`
  const warnings = report.channels
    .filter(channel => channel.state === 'on' || channel.state === 'missing')
    .map(channel => channel.state === 'on'
      ? `${channel.label} is on${channel.changedBy === undefined ? '' : ` (set in ${channel.changedBy})`}. ${channel.fix ?? ''}`.trim()
      : `${channel.label}: ${channel.fix ?? ''}`.trim())
  if (!report.search.private) {
    warnings.push(report.search.provider.startsWith('deepseek')
      ? `web.searchProvider is "${report.search.provider}", a DeepSeek provider. Searches fail until it is reset: remove the web entry from your profile's cordis.patch.yml, or set searchProvider to searxng or brave.`
      : `web.searchProvider is "${report.search.provider || 'unset'}", not one of this bundle's private providers (searxng, brave).`)
  }
  if (report.search.fetchProvider !== 'http') {
    warnings.push(`web.fetchProvider is "${report.search.fetchProvider || 'unset'}"; set it to http so pages are fetched directly from this machine.`)
  }
  return { summary: `OTR: ${String(off)} of ${String(telemetry.length)} telemetry channels off, ${search}`, warnings }
}
