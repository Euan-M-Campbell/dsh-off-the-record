/**
 * `BraveSearchProvider`: a `WebSearchProvider` backed by the Brave Search API
 * (`GET https://api.search.brave.com/res/v1/web/search`). The endpoint is
 * fixed, so the API key can never be sent anywhere else.
 * @module dsh-off-the-record/web-search-brave/provider
 */

import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'
import { dedupeSources, getJson, record, sourceUrl, text, unexpectedShape } from '../shared/search-http.ts'

/** Stable id this provider registers under; `web.searchProvider` names it. */
export const BRAVE_PROVIDER_ID = 'brave'

/** The only endpoint this provider contacts. */
export const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

/** Brave's largest accepted `count`. */
export const BRAVE_MAX_COUNT = 20

/** Live provider settings, read at each call. */
export interface BraveSettings {
  readonly searchTimeoutMs: number
  readonly userAgent: string
}

/** Key access: a cheap cached presence check, and a per-search resolve. */
export interface BraveKeySource {
  /** Whether a key was configured at the last credential refresh. */
  configured(): boolean
  /** Resolve the key for one search; undefined while unconfigured. */
  resolve(): Promise<string | undefined>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\'' }

/**
 * Brave descriptions carry `<strong>` highlighting and HTML entities; reduce
 * them to plain text.
 * @param value - one description.
 * @returns plain text.
 */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (match, entity: string) => {
      const known = ENTITIES[entity.toLowerCase()]
      if (known !== undefined) return known
      if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
      return match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Map one Brave web result to a source.
 * @param value - one entry of `web.results[]`.
 * @returns the source, or undefined when it has no citeable URL.
 */
export function mapBraveResult(value: unknown): WebSearchSource | undefined {
  const result = record(value)
  const url = sourceUrl(result?.url)
  if (result === undefined || url === undefined) return undefined
  const rawTitle = text(result.title)
  const rawSnippet = text(result.description)
  const title = rawTitle === undefined ? undefined : plainText(rawTitle) || undefined
  const snippet = rawSnippet === undefined ? undefined : plainText(rawSnippet) || undefined
  const publishedAt = text(result.page_age)
  return {
    url,
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}

/**
 * Map a Brave response. A query with no web results omits `web` entirely.
 * @param body - the parsed response.
 * @returns the normalized result; the web service applies `maxResults`.
 */
export function mapBraveResponse(body: unknown): WebSearchResult {
  const response = record(body)
  if (response === undefined) unexpectedShape('Brave')
  const web = response.web === undefined ? { results: [] } : record(response.web)
  if (web === undefined || !Array.isArray(web.results ?? [])) unexpectedShape('Brave')
  const results = (web.results ?? []) as unknown[]
  return {
    sources: dedupeSources(results.map(mapBraveResult).filter((source): source is WebSearchSource => source !== undefined)),
    truncated: false,
  }
}

/**
 * Explain a non-2xx status with the fix.
 * @param status - HTTP status.
 * @returns the error message.
 */
export function describeBraveStatus(status: number): string {
  if (status === 401 || status === 403) return `Brave rejected the API key (HTTP ${String(status)}); check the Brave key on the Off the Record page`
  if (status === 402) return 'Brave refused the request for billing reasons (HTTP 402); check the subscription on the Brave API dashboard'
  if (status === 429) return 'Brave rate limit or monthly quota reached (HTTP 429); try again later or raise the plan limit'
  return `Brave returned HTTP ${String(status)}`
}

/** Search through the Brave Search API with the user's key. */
export class BraveSearchProvider implements WebSearchProvider {
  readonly id = BRAVE_PROVIDER_ID

  constructor(private readonly key: BraveKeySource, private readonly settings: () => BraveSettings) {}

  available(): boolean {
    return this.key.configured()
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const key = await this.key.resolve()
    if (key === undefined) {
      throw new WebError('Brave search is not set up: no Brave API key is stored. Add one on the Off the Record page.', 'WEB_PROVIDER_CREDENTIAL_MISSING')
    }
    const settings = this.settings()
    const url = new URL(BRAVE_SEARCH_ENDPOINT)
    url.searchParams.set('q', request.query)
    if (request.maxResults !== undefined) url.searchParams.set('count', String(Math.min(Math.max(1, Math.trunc(request.maxResults)), BRAVE_MAX_COUNT)))
    const body = await getJson({
      label: 'Brave',
      url,
      headers: { 'x-subscription-token': key, 'user-agent': settings.userAgent },
      timeoutMs: settings.searchTimeoutMs,
      signal,
      describeStatus: describeBraveStatus,
    })
    return mapBraveResponse(body)
  }
}
