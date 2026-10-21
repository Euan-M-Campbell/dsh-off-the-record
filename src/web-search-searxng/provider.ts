/**
 * `SearxngSearchProvider`: a `WebSearchProvider` backed by the user's own
 * SearXNG instance (`GET {baseURL}/search?q=…&format=json`).
 * @module dsh-off-the-record/web-search-searxng/provider
 */

import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'
import { dedupeSources, getJson, record, sourceUrl, text, unexpectedShape } from '../shared/search-http.ts'

/** Stable id this provider registers under; `web.searchProvider` names it. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Live provider settings, read at each call so configuration edits apply without a restart. */
export interface SearxngSettings {
  /** Instance root, such as `http://127.0.0.1:8888`; empty while unconfigured. */
  readonly baseURL: string
  /** Comma-separated SearXNG engine names; empty sends none. */
  readonly engines: string
  /** Comma-separated SearXNG categories; empty sends none. */
  readonly categories: string
  readonly searchTimeoutMs: number
  readonly userAgent: string
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa']

/**
 * Whether a hostname names this machine or a private network, where plain
 * `http:` is acceptable. Single-label names (Docker and Compose service names)
 * count as private.
 * @param hostname - `URL.hostname`, with IPv6 brackets.
 * @returns whether the host is loopback, link-local, or private.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix))) return true
  if (host.startsWith('[')) {
    const v6 = host.slice(1, -1)
    return v6 === '::1' || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6)
  }
  const octets = host.split('.')
  if (octets.length === 4 && octets.every(part => /^\d{1,3}$/.test(part))) {
    const [a = 0, b = 0] = octets.map(Number)
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  return !host.includes('.')
}

/**
 * Validate an instance root.
 * @param baseURL - configured value.
 * @returns undefined when usable, otherwise the reason it is not.
 */
export function baseUrlProblem(baseURL: string): string | undefined {
  if (baseURL.length === 0) return 'no SearXNG instance is configured'
  if (!URL.canParse(baseURL)) return `"${baseURL}" is not a URL`
  const url = new URL(baseURL)
  if (url.username !== '' || url.password !== '') return 'the SearXNG URL must not contain credentials'
  if (url.search !== '' || url.hash !== '') return 'the SearXNG URL must not contain a query or fragment'
  if (url.protocol === 'https:') return undefined
  if (url.protocol === 'http:') {
    return isPrivateHost(url.hostname) ? undefined : 'plain http is allowed only for this machine or a private network; use https'
  }
  return `unsupported protocol ${url.protocol}`
}

/**
 * Build the search URL beneath the instance root, keeping any path prefix.
 * @param settings - live settings with a valid `baseURL`.
 * @param query - the search text.
 * @returns the request URL.
 */
export function searchUrl(settings: SearxngSettings, query: string): URL {
  const root = new URL(settings.baseURL)
  if (!root.pathname.endsWith('/')) root.pathname += '/'
  const url = new URL('search', root)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  if (settings.engines.length > 0) url.searchParams.set('engines', settings.engines)
  if (settings.categories.length > 0) url.searchParams.set('categories', settings.categories)
  return url
}

/**
 * Map one SearXNG result to a source.
 * @param value - one entry of `results[]`.
 * @returns the source, or undefined when it has no citeable URL.
 */
export function mapSearxngResult(value: unknown): WebSearchSource | undefined {
  const result = record(value)
  const url = sourceUrl(result?.url)
  if (result === undefined || url === undefined) return undefined
  const title = text(result.title)
  const snippet = text(result.content)
  const publishedAt = text(result.publishedDate)
  return {
    url,
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}

/**
 * Map a SearXNG JSON response. Direct answers become `content`; older
 * instances send them as strings, newer ones as `{ answer }` objects.
 * @param body - the parsed response.
 * @returns the normalized result; the web service applies `maxResults`.
 */
export function mapSearxngResponse(body: unknown): WebSearchResult {
  const response = record(body)
  if (response === undefined || !Array.isArray(response.results)) unexpectedShape('SearXNG')
  const sources = dedupeSources(response.results
    .map(mapSearxngResult)
    .filter((source): source is WebSearchSource => source !== undefined))
  const answers = (Array.isArray(response.answers) ? response.answers : [])
    .map(answer => text(answer) ?? text(record(answer)?.answer))
    .filter((answer): answer is string => answer !== undefined)
  return { ...answers.length === 0 ? {} : { content: answers.join('\n') }, sources, truncated: false }
}

/**
 * Explain a non-2xx status with the fix.
 * @param status - HTTP status.
 * @returns the error message.
 */
export function describeSearxngStatus(status: number): string {
  if (status === 403) return 'SearXNG returned HTTP 403; enable the json format under search.formats in the instance\'s settings.yml'
  if (status === 429) return 'SearXNG rate-limited this request (HTTP 429); turn off the limiter, or allow this machine, in the instance\'s settings'
  return `SearXNG returned HTTP ${String(status)}`
}

/** Search through the configured SearXNG instance. */
export class SearxngSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID

  constructor(private readonly settings: () => SearxngSettings) {}

  available(): boolean {
    return baseUrlProblem(this.settings().baseURL) === undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const settings = this.settings()
    const problem = baseUrlProblem(settings.baseURL)
    if (problem !== undefined) {
      throw new WebError(`SearXNG search is not set up: ${problem}. Set the instance URL on the Off the Record page.`, 'WEB_PROVIDER_NOT_CONFIGURED')
    }
    const body = await getJson({
      label: 'SearXNG',
      url: searchUrl(settings, request.query),
      headers: { 'user-agent': settings.userAgent },
      timeoutMs: settings.searchTimeoutMs,
      signal,
      describeStatus: describeSearxngStatus,
    })
    return mapSearxngResponse(body)
  }
}
